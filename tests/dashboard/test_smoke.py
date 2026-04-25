"""End-to-end smoke test: synthetic snapshot → render → verify HTML output."""
from pathlib import Path
from scripts.dashboard.smoke_test import run_smoke_test


def test_smoke_produces_all_role_htmls(tmp_path):
    result = run_smoke_test(output_dir=tmp_path)
    # 4 single-role HTMLs (ceo, pm, qa, qa_auditor) + 1 per dev
    assert "ceo" in result["htmls"]
    assert "pm" in result["htmls"]
    assert "qa" in result["htmls"]
    assert "qa_auditor" in result["htmls"]
    # 4 devs in the fixture
    assert len(result["htmls"]["dev"]) == 4


def test_smoke_htmls_contain_expected_content(tmp_path):
    result = run_smoke_test(output_dir=tmp_path)
    ceo_html = Path(result["htmls"]["ceo"]).read_text()
    assert "<html" in ceo_html.lower()
    assert "Phonebot 2.0" in ceo_html
    # CEO sees all 5 tabs
    for tab in ("ceo", "pm", "dev", "qa", "qa_auditor"):
        assert f'data-tab="{tab}"' in ceo_html


def test_dev_html_filtered_to_one_dev(tmp_path):
    result = run_smoke_test(output_dir=tmp_path)
    # Find Faizan's HTML
    faizan_path = None
    for email, path in result["htmls"]["dev"].items():
        if "faizan" in email:
            faizan_path = path
            break
    assert faizan_path is not None
    faizan_html = Path(faizan_path).read_text()
    # Dev view: only 3 tabs
    assert 'data-tab="dev"' in faizan_html
    assert 'data-tab="qa"' in faizan_html
    assert 'data-tab="qa_auditor"' in faizan_html
    assert 'data-tab="ceo"' not in faizan_html
    assert 'data-tab="pm"' not in faizan_html


def test_qa_html_no_percent_complete(tmp_path):
    result = run_smoke_test(output_dir=tmp_path)
    qa_html = Path(result["htmls"]["qa"]).read_text()
    # QA view doesn't render percent values
    # The synthetic data uses percent_complete=33.3 which should NOT appear in qa html
    assert "33.3" not in qa_html
