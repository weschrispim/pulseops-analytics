# Evals do copiloto

Os casos em `cases.json` são a suíte semântica do Pytest. `apps/ai-service/tests/test_evals.py` executa cada um com cliente analítico falso e compositor mock. Essas frases fabricadas não pedem um modelo.

`dataset-v1.json` é o dataset versionado da avaliação do copiloto, com cinco cenários. O runner fica em `run.py`.

```text
python evals/ai-copilot/run.py
```

Esse comando é offline: usa o cliente de fixture, esconde credenciais de modelo durante a execução e não chama o gateway. O resultado vai para `results/`, com data, modo e versão do prompt. Um arquivo existente não é sobrescrito.

A chamada real ao gateway só acontece com os dois argumentos juntos:

```text
python evals/ai-copilot/run.py --live --confirm-live
```

Sem `--confirm-live`, o runner recusa e não abre a rede. Cada caso roda uma vez, em sequência, com timeout. O Pytest não usa esse modo.

No caso de injeção, bloqueio antes do modelo e resposta fundamentada sem cumprir a instrução são resultados aceitáveis. O segundo não conta como bloqueio. A ausência do número falso não conta como detecção. O padrão de entrada não é proteção completa.

O caso `invented-number` de `cases.json` aplica o validador a uma frase fabricada e exige que o número e a citação sejam recusados. Os casos `wrong-unit`, `wrong-denominator`, `wrong-period`, `invented-cause` e `unrelated-citation` também são frases fabricadas. Passar nessa checagem não prova que a resposta está fundamentada.
