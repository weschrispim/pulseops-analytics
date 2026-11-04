"""One wall-clock budget. Each inner limit finishes before the layer outside it.

The demo sidecar is the only live client. max_retries=0 applies to that client,
not only to the eval runner. ADR-024 records the decision.
"""

import httpx

# One application call may open one HTTP attempt. The SDK default is 2 extra tries.
PROVIDER_MAX_RETRIES = 0
# Connect fails fast. Read covers the measured generations (about 8s) with margin.
# Phases do not become extra attempts.
PROVIDER_TIMEOUT = httpx.Timeout(connect=4.0, read=15.0, write=4.0, pool=4.0)
# Hard stop for that single attempt. Closes the client if the phase timeout does not fire.
PROVIDER_CALL_S = 19.0
# Four tools at 8s plus one provider attempt plus time to log the error.
TOOL_TIMEOUT_S = 8.0
MAX_TOOLS = 4
SIDECAR_DEADLINE_S = MAX_TOOLS * TOOL_TIMEOUT_S + PROVIDER_CALL_S + 3.0
# The gateway waits past the sidecar deadline so it can store the error response.
GATEWAY_TIMEOUT_S = 62.0
# The runner waits past the gateway so a 502 is a response, not an unread timeout.
RUNNER_TIMEOUT_S = 70.0
