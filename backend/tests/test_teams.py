import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from collections import Counter

from lib.teams import (
    build_team_name_lookup,
    load_teams_for_season,
    load_teams_from_csv,
    resolve_team_id,
)


def test_resolve_team_id_handles_school_and_full_name():
    lookup = build_team_name_lookup()

    assert resolve_team_id('Boston College', lookup) == 'boston-college'
    assert resolve_team_id('Boston College Eagles', lookup) == 'boston-college'


def test_resolve_team_id_handles_common_aliases():
    lookup = build_team_name_lookup()

    assert resolve_team_id('Texas San Antonio', lookup) == 'utsa'
    assert resolve_team_id('Ole Miss Rebels', lookup) == 'ole-miss'


def test_2026_fbs_membership_and_conference_counts():
    teams = load_teams_for_season(2026)
    teams_by_id = {team['id']: team for team in teams}
    conference_counts = Counter(team.get('conference') for team in teams)

    assert len(teams) == 138
    assert teams_by_id['north-dakota-state']['conference'] == 'Mountain West'
    assert teams_by_id['sacramento-state']['conference'] == 'MAC'
    assert teams_by_id['texas-state']['conference'] == 'Pac-12'
    assert teams_by_id['louisiana-tech']['conference'] == 'Sun Belt'
    assert conference_counts['Pac-12'] == 8
    assert conference_counts['Mountain West'] == 10
    assert conference_counts['MAC'] == 13
    assert conference_counts['CUSA'] == 10


def test_historical_membership_handles_idaho_and_uab_hiatus():
    teams_2014 = {team['id']: team for team in load_teams_for_season(2014)}
    teams_2015 = {team['id']: team for team in load_teams_for_season(2015)}
    teams_2018 = {team['id']: team for team in load_teams_for_season(2018)}

    assert len(teams_2014) == 128
    assert teams_2014['idaho']['conference'] == 'Sun Belt'
    assert 'uab' in teams_2014
    assert 'uab' not in teams_2015
    assert 'idaho' not in teams_2018
