from decimal import Decimal, InvalidOperation


def require_cent_precision(value, field_name: str):
    """Reject monetary values that cannot be represented to the nearest centavo."""
    if value is None:
        return value
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount != amount.quantize(Decimal("0.01")):
            raise ValueError
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must have no more than two decimal places.") from exc
    return value
