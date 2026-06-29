from services.category_label import format_category_label, labels_equivalent, normalize_category_label


def test_normalize_collapses_whitespace_and_lowercases():
    assert normalize_category_label("  Кафе, бары  ") == "кафе, бары"


def test_labels_equivalent_case_insensitive():
    assert labels_equivalent("Для Детей", "для детей")


def test_format_category_label_title_case():
    assert format_category_label("для детей") == "Для Детей"
