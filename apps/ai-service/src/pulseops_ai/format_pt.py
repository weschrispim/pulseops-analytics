def format_int(value: float | int) -> str:
    return f"{int(round(value)):,}".replace(",", ".")


def format_percent(rate: float) -> str:
    percent = round(rate * 100, 1)
    return f"{percent:.1f}".replace(".", ",") + "%"


def format_hours(value: float) -> str:
    return f"{value:.1f}".replace(".", ",") + " h"
