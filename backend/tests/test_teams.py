import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from lib.teams import build_team_name_lookup, resolve_team_id


def test_resolve_team_id_handles_school_and_full_name():
    lookup = build_team_name_lookup()

    assert resolve_team_id('Boston College', lookup) == 'boston-college'
    assert resolve_team_id('Boston College Eagles', lookup) == 'boston-college'


def test_resolve_team_id_handles_common_aliases():
    lookup = build_team_name_lookup()

    assert resolve_team_id('Texas San Antonio', lookup) == 'utsa'
    assert resolve_team_id('Ole Miss Rebels', lookup) == 'ole-miss'
