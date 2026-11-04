import re

MAX_QUESTION_LENGTH = 500

_INJECTION = re.compile(
    r"(ignore (as |all |previous |anteriores )|"
    r"ignor[ae]\s+suas\s+instru[cç][oõ]es|"
    r"ignore\s+instructions|"
    r"ignore\s+(?:your|the|all|my)\s+(?:previous\s+|prior\s+)?instructions|"
    r"disregard\s+(?:your|the|all|previous)\s+instructions|"
    r"prompt anterior|system prompt|"
    r"voc[eê] agora [eé]|reveal the prompt|revele o prompt|"
    r"developer message|jailbreak)",
    re.IGNORECASE,
)
_SQL = re.compile(
    r"\b(select\s+.+\s+from|insert\s+into|update\s+\w+\s+set|"
    r"delete\s+from|drop\s+table|union\s+select)\b",
    re.IGNORECASE,
)
_UUID = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
    re.IGNORECASE,
)
_OUT_OF_SCOPE = re.compile(
    r"\b(previs[aã]o do tempo|clima|sal[aá]rio|receita|piada|"
    r"escreva um poema|quem ganhou o jogo)\b",
    re.IGNORECASE,
)


def injection_attempt(question: str) -> bool:
    """True when the text matches a known injection pattern. A regex is not complete protection."""
    return _INJECTION.search(question) is not None


def screen_question(question: str, organization_id: str) -> str | None:
    """Return a rejection reason, or None when the question may proceed."""
    text = question.strip()
    if not text:
        return "Pergunta vazia."
    if len(text) > MAX_QUESTION_LENGTH:
        return "Pergunta acima do limite de 500 caracteres."
    if injection_attempt(text):
        return "A pergunta tenta alterar as instruções do copiloto."
    if _SQL.search(text):
        return "O copiloto não executa SQL."
    if _OUT_OF_SCOPE.search(text):
        return "A pergunta está fora do domínio de eficiência operacional."
    for found in _UUID.findall(text):
        if found.lower() != organization_id.lower():
            return "A pergunta pede dados de outra organização."
    return None
