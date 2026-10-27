import re


_LOCAL_PART_PATTERN = re.compile(
    r"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$"
)
_DOMAIN_PATTERN = re.compile(
    r"^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$"
)


def is_valid_email_format(email):
    if not isinstance(email, str) or len(email) > 254 or any(char.isspace() for char in email):
        return False

    if email.count("@") != 1:
        return False

    local_part, domain = email.split("@")
    return bool(
        _LOCAL_PART_PATTERN.fullmatch(local_part)
        and _DOMAIN_PATTERN.fullmatch(domain)
        and len(local_part) <= 64
    )
