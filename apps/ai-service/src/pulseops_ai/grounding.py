import re

from pulseops_ai.contracts import Claim, EvidenceItem

_CITE = re.compile(r"\[(E\d+)\]", re.IGNORECASE)
_BARE_CITE = re.compile(r"\bE\d+\b", re.IGNORECASE)
_NUMBER = re.compile(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?%?|\d+(?:,\d+)?%?")
_PERCENT = re.compile(r"\d+(?:,\d+)?%")
_PAIR = re.compile(r"(\d{1,3}(?:\.\d{3})+|\d+)\s+de\s+(\d{1,3}(?:\.\d{3})+|\d+)")
_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
_BR_DATE = re.compile(r"\d{2}/\d{2}/\d{4}")
_TIME = re.compile(r"\b\d{1,2}:\d{2}(?::\d{2})?\b")
_UUID = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)
_CAUSAL = re.compile(
    r"\b(causad[oa]s?|a causa [eé]|devido (?:a|ao|à|aos|às)|porque)\b",
    re.IGNORECASE,
)
_NEGATED = re.compile(
    r"n[aã]o (indica|explica| [eé] uma) (a )?causa|n[aã]o (?:e|é) porque",
    re.IGNORECASE,
)
_UNIT_NAMES = ("centro", "norte", "sul", "leste", "oeste")


def _parse(token: str) -> float | None:
    raw = token.strip()
    percent = raw.endswith("%")
    if percent:
        raw = raw[:-1]
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", raw):
        number = float(raw.replace(".", ""))
    elif "," in raw:
        number = float(raw.replace(".", "").replace(",", "."))
    else:
        number = float(raw)
    return number


def _values_of(item: EvidenceItem) -> set[float]:
    allowed: set[float] = set()
    if isinstance(item.value, bool) or item.value is None:
        return allowed
    if isinstance(item.value, (int, float)):
        number = float(item.value)
        allowed.add(round(number, 4))
        allowed.add(round(number, 1))
        allowed.add(float(int(round(number))))
        if _rate_like(item):
            allowed.add(round(number * 100, 1))
    elif isinstance(item.value, str):
        for match in _NUMBER.findall(item.value):
            parsed = _parse(match)
            if parsed is not None:
                allowed.add(round(parsed, 1))
    return allowed


def _metric_tokens(text: str) -> list[tuple[str, float]]:
    tokens: list[tuple[str, float]] = []
    for token in _NUMBER.findall(_metric_text(text)):
        if re.fullmatch(r"20\d{2}", token):
            continue
        parsed = _parse(token)
        if parsed is None:
            continue
        if parsed < 10 and not token.endswith("%") and "," not in token:
            continue
        tokens.append((token, parsed))
    return tokens


def _expected_ids(number: float, evidence: list[EvidenceItem]) -> list[str]:
    return [item.id for item in evidence if _close(number, _values_of(item))]


def _with_place(message: str, detail: dict) -> str:
    bits: list[str] = []
    if detail.get("sentence") is not None:
        bits.append(f"frase {detail['sentence']}")
    if detail.get("claim") is not None:
        claim = f"claim {detail['claim']}"
        if detail.get("claimType"):
            claim = f"{claim} {detail['claimType']}"
        bits.append(claim)
    expected = detail.get("expectedEvidence") or []
    if expected:
        bits.append("evidência esperada " + ", ".join(expected))
    if not bits:
        return message
    return f"{message} ({'; '.join(bits)})"


def _binding_problems(
    text: str,
    cited: list[EvidenceItem],
    *,
    linked: bool,
    absent: str,
    mismatch: str,
    evidence: list[EvidenceItem] | None = None,
    details: list[dict] | None = None,
    sentence_index: int | None = None,
    claim_index: int | None = None,
    claim_type: str | None = None,
) -> list[str]:
    supported: set[float] = set()
    for item in cited:
        supported |= _values_of(item)
    problems: list[str] = []
    for token, parsed in _metric_tokens(text):
        if not linked:
            reason = "sem citação"
            base = absent.format(token=token)
        elif not _close(parsed, supported):
            reason = "métrica não sustentada"
            base = mismatch.format(token=token)
        else:
            continue
        detail = {
            "token": token,
            "sentence": sentence_index,
            "claim": claim_index,
            "claimType": claim_type,
            "expectedEvidence": _expected_ids(parsed, evidence or []),
            "reason": reason,
        }
        if details is not None:
            details.append(detail)
        problems.append(_with_place(base, detail))
    return problems


def _close(number: float, allowed: set[float]) -> bool:
    for candidate in allowed:
        if abs(candidate - number) <= 0.15:
            return True
    return False


def _cite_ids(text: str) -> list[str]:
    seen: set[str] = set()
    ids: list[str] = []
    for match in _CITE.findall(text) + _BARE_CITE.findall(text):
        cite = match.upper()
        if cite not in seen:
            seen.add(cite)
            ids.append(cite)
    return ids


def _metric_text(answer: str) -> str:
    """Drop tokens that are not operational metrics before reading numbers."""
    text = _UUID.sub(" ", answer)
    text = _ISO_DATE.sub(" ", text)
    text = _BR_DATE.sub(" ", text)
    text = _TIME.sub(" ", text)
    text = _CITE.sub(" ", text)
    text = _BARE_CITE.sub(" ", text)
    return text


def _sentences(answer: str) -> list[str]:
    parts = [part for part in re.split(r"(?<=[.!?])\s+", answer.strip()) if part]
    merged: list[str] = []
    for part in parts:
        if merged and re.fullmatch(r"(?:\[E\d+\]\s*)+", part.strip()):
            merged[-1] = f"{merged[-1]} {part.strip()}"
        else:
            merged.append(part)
    return merged


def _named_units(sentence: str) -> set[str]:
    fold = sentence.casefold()
    return {name for name in _UNIT_NAMES if re.search(rf"\b{name}\b", fold)}


def _rate_like(item: EvidenceItem) -> bool:
    if isinstance(item.value, bool) or not isinstance(item.value, (int, float)):
        return False
    return item.kind.endswith("rate") or (item.kind == "insight_value" and 0 <= float(item.value) <= 1)


def _supports(item: EvidenceItem, topic: str) -> bool:
    if topic == "gargalo":
        return item.kind.startswith("bottleneck") or item.kind in {
            "unit_overdue_rate",
            "unit_rank",
        } or item.rule_id in {"INS-01", "INS-05"}
    if topic == "sla":
        return item.kind == "sla_rate" or item.rule_id == "INS-06"
    if topic == "tratativa":
        return "hour" in item.kind or item.rule_id == "INS-02"
    return False


def _topics(sentence: str) -> list[str]:
    fold = sentence.casefold()
    found: list[str] = []
    if "gargalo" in fold or "vencid" in fold:
        found.append("gargalo")
    if "sla" in fold:
        found.append("sla")
    if "tratativa" in fold:
        found.append("tratativa")
    return found


def _period_dates(evidence: list[EvidenceItem]) -> set[str]:
    allowed: set[str] = set()
    for item in evidence:
        if item.kind != "period" or not isinstance(item.value, str):
            continue
        for iso in _ISO_DATE.findall(item.value):
            allowed.add(iso)
            year, month, day = iso.split("-")
            allowed.add(f"{day}/{month}/{year}")
    return allowed


def _count(evidence: list[EvidenceItem], unit_id: str | None, kind: str) -> float | None:
    if not unit_id:
        return None
    for item in evidence:
        if item.unit_id == unit_id and item.kind == kind and isinstance(item.value, (int, float)):
            return float(item.value)
    return None


def _semantic_problems(answer: str, evidence: list[EvidenceItem]) -> list[str]:
    """Catch mismatches the global number set cannot see.

    A passing result is still not proof that the sentence is grounded.
    """
    problems: list[str] = []
    by_id = {item.id: item for item in evidence}
    dates = _period_dates(evidence)
    for sentence in _sentences(answer):
        named = _named_units(sentence)
        cited = [by_id[cite] for cite in _cite_ids(sentence) if cite in by_id]
        for item in cited:
            if _rate_like(item):
                percents = [parsed for token in _PERCENT.findall(sentence) if (parsed := _parse(token)) is not None]
                target = round(float(item.value) * 100, 1)
                if percents and not any(_close(percent, {target, float(item.value)}) for percent in percents):
                    problems.append(f"Valor associado a [{item.id}] não corresponde à evidência.")
            if item.unit_name and named and item.unit_name.casefold() not in named:
                problems.append(
                    f"Citação [{item.id}] é de {item.unit_name}, mas a frase nomeia outra unidade."
                )
        for topic in _topics(sentence):
            if cited and not any(_supports(item, topic) for item in cited):
                ids = ", ".join(item.id for item in cited)
                problems.append(f"Citação {ids} não sustenta a afirmação sobre {topic}.")
        for item in cited:
            if item.kind not in {"bottleneck_rate", "unit_overdue_rate"}:
                continue
            overdue = _count(evidence, item.unit_id, "bottleneck_overdue")
            pending = _count(evidence, item.unit_id, "bottleneck_pending")
            if overdue is None or pending is None:
                continue
            for left_token, right_token in _PAIR.findall(sentence):
                left = _parse(left_token)
                right = _parse(right_token)
                if left is None or right is None:
                    continue
                if _close(left, {overdue}) and not _close(right, {pending}):
                    problems.append(
                        f"Denominador {right_token} não é a pendência de {item.unit_name or 'a unidade'}."
                    )
    if dates:
        for token in _ISO_DATE.findall(answer) + _BR_DATE.findall(answer):
            if token not in dates:
                problems.append(f"Período citado não está na evidência: {token}")
    return problems


def validate_answer(
    answer: str,
    evidence: list[EvidenceItem],
    details: list[dict] | None = None,
) -> list[str]:
    """Return problems. Empty means the citation, numeric and semantic checks passed.

    A number must match an evidence id cited in the same sentence.
    A value that only exists somewhere else in the evidence is not enough.
    This is still not a proof that the sentence is grounded.
    """
    problems: list[str] = []
    by_id = {item.id.upper(): item for item in evidence}
    known = set(by_id)
    for cite in _cite_ids(answer):
        if cite not in known:
            problems.append(f"Citação inexistente: {cite}")
    for index, sentence in enumerate(_sentences(answer), start=1):
        raw = _cite_ids(sentence)
        cited = [by_id[cite] for cite in raw if cite in by_id]
        problems.extend(
            _binding_problems(
                sentence,
                cited,
                linked=bool(raw),
                absent="Afirmação quantitativa sem citação: {token}",
                mismatch="Número sem evidência citada: {token}",
                evidence=evidence,
                details=details,
                sentence_index=index,
            )
        )
    if _CAUSAL.search(answer) and not _NEGATED.search(answer):
        problems.append("Afirmação causal sem ressalva da evidência.")
    problems.extend(_semantic_problems(answer, evidence))
    return problems


_QUALIFIED = re.compile(
    r"hip[oó]tese|n[aã]o comprov|n[aã]o permite concluir|sem evid[eê]ncia de causa",
    re.IGNORECASE,
)
_GUARANTEE = re.compile(r"\b(garante|resolve|solu[cç][aã]o|com certeza)\b", re.IGNORECASE)
_NUMERIC_METRIC = re.compile(r"^[+-]?\d+(?:[.,]\d+)?%?$")


def _claim_check(
    details: list[dict] | None,
    index: int,
    claim_type: str,
    metric: str | None,
    evidence_ids: list[str],
    rule: str,
) -> None:
    if details is None:
        return
    details.append(
        {
            "claim": index,
            "claimType": claim_type,
            "metric": metric,
            "evidenceIds": list(evidence_ids),
            "reason": rule,
            "token": None,
            "sentence": None,
            "expectedEvidence": [],
        }
    )


def _metric_identifier_problems(
    metric: str,
    cited: list[EvidenceItem],
    claim: Claim,
    index: int,
    details: list[dict] | None,
) -> list[str]:
    """metrics holds a kind, never a number. The number stays on the sentence checker."""
    cited_ids = [item.id for item in cited]
    if _NUMERIC_METRIC.fullmatch(metric.strip()):
        _claim_check(details, index, claim.type, metric, cited_ids, "metric_value_not_identifier")
        return [f"Métrica {metric} é um valor, não um identificador (claim {index})."]
    if not cited:
        return []
    matched = [item for item in cited if item.kind == metric]
    if not matched:
        _claim_check(details, index, claim.type, metric, cited_ids, "metric_not_on_cited_evidence")
        return [f"Métrica {metric} não está nas evidências citadas (claim {index})."]
    problems: list[str] = []
    for unit in claim.entities:
        if unit.casefold() not in _UNIT_NAMES:
            continue
        has_unit = any(item.unit_name for item in matched)
        same_unit = any(item.unit_name and item.unit_name.casefold() == unit.casefold() for item in matched)
        if has_unit and not same_unit:
            _claim_check(details, index, claim.type, metric, cited_ids, "metric_unit_mismatch")
            problems.append(f"Métrica {metric} não corresponde à unidade {unit} (claim {index}).")
    return problems


def validate_claims(
    claims: list[Claim],
    evidence: list[EvidenceItem],
    details: list[dict] | None = None,
) -> list[str]:
    """Check the typed claims attached to a generative answer. Empty claims fail."""
    if not claims:
        return ["Resposta generativa sem afirmações estruturadas."]
    problems: list[str] = []
    by_id = {item.id.upper(): item for item in evidence}
    for index, claim in enumerate(claims, start=1):
        ids = [cite.upper() for cite in claim.evidence_ids]
        for cite in ids:
            if cite not in by_id:
                problems.append(f"Afirmação estruturada cita evidência inexistente: {cite} (claim {index} {claim.type})")
        cited = [by_id[cite] for cite in ids if cite in by_id]
        for sentence_index, sentence in enumerate(_sentences(claim.text), start=1):
            problems.extend(
                _binding_problems(
                    sentence,
                    cited,
                    linked=bool(ids),
                    absent="Afirmação estruturada sem evidência para: {token}",
                    mismatch="Afirmação estruturada não sustenta: {token}",
                    evidence=evidence,
                    details=details,
                    sentence_index=sentence_index,
                    claim_index=index,
                    claim_type=claim.type,
                )
            )
        if claim.type in {"fact", "comparison"} and _CAUSAL.search(claim.text) and not _NEGATED.search(claim.text):
            problems.append("Fato ou comparação não pode afirmar causa.")
        if claim.type == "hypothesis" and not _QUALIFIED.search(claim.text):
            problems.append("Hipótese sem qualificação explícita.")
            _claim_check(details, index, claim.type, None, ids, "hypothesis_unqualified")
        if claim.type == "recommendation" and _GUARANTEE.search(claim.text):
            problems.append("Recomendação apresentada como solução garantida.")
            _claim_check(details, index, claim.type, None, ids, "recommendation_guarantee")
        if claim.metrics and not cited:
            problems.append("Métrica declarada sem evidência citada.")
            _claim_check(details, index, claim.type, None, ids, "metric_without_evidence")
        for metric in claim.metrics:
            problems.extend(_metric_identifier_problems(metric, cited, claim, index, details))
        if claim.entities and not cited:
            problems.append("Entidade declarada sem evidência citada.")
        for entity in claim.entities:
            fold = entity.casefold()
            if cited and not any(
                (item.unit_name and fold == item.unit_name.casefold()) or fold in str(item.value).casefold()
                for item in cited
            ):
                problems.append(f"Entidade {entity} não está nas evidências citadas.")
    return problems
