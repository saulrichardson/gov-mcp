import json
from copy import deepcopy
from pathlib import Path

BASE_PATH = Path("/Users/saulrichardson/projects/gov-gpt/runs/v2/v2__awards__accounts")
PASS1_PATH = BASE_PATH / "discover" / "summary.json"
OUTPUT_PATH = BASE_PATH / "validate" / "summary.json"

pass1 = json.loads(PASS1_PATH.read_text())

contract = deepcopy(pass1["contract"])
probes = list(pass1["probes"])
mismatches = list(pass1["mismatches"])
gaps = list(pass1["gaps"])
risks = list(pass1["risks"])

contract["confidence"] = "observed"
contract["description"] = "Returns the federal accounts tied to a specific award, supporting the Award Summary federal accounts visualization."
contract["inputSchema"]["confidence"] = "observed"
contract["outputSchema"]["confidence"] = "observed"

contract["inputSchema"]["properties"]["limit"]["constraints"] = (
    "Optional. Integer between 1 and 100. Defaults to 10 when omitted. Numeric strings are coerced; zero/negative or >100 yield 422; non-integer values rejected with 400."
)
contract["inputSchema"]["properties"]["page"]["constraints"] = (
    "Optional. Integer >=1 (defaults to 1). Numeric strings are coerced. Values <1 return 422; non-integers rejected with 400. Pages beyond available data return 200 with empty results."
)
contract["inputSchema"]["properties"]["award_id"]["constraints"] = (
    "Required. Must be non-empty text or integer-like ID. Null/blank rejected with 422; unknown IDs return 200 with empty results."
)
contract["inputSchema"]["properties"]["order"]["constraints"] = (
    "Optional. Must be 'asc' or 'desc' (lowercase). Defaults to 'desc'. Invalid values return 400."
)
contract["inputSchema"]["properties"]["sort"]["constraints"] = (
    "Optional. One of 'federal_account', 'total_transaction_obligated_amount', 'agency', 'account_title'. Defaults to 'federal_account'. Case sensitive; invalid values return 400."
)

contract["outputSchema"]["properties"]["results"] = {
    "type": "array",
    "description": "List of federal account records for the award ordered per the chosen sort. Each object includes total_transaction_obligated_amount (number), federal_account (string TAS prefix-main), account_title (string), and funding_agency_* fields (abbreviation, name, slug as strings; funding_agency_id and funding_toptier_agency_id as integers). Fields were always populated in probes; docs allow nulls but unobserved here."
}
contract["outputSchema"]["properties"]["page_metadata"] = {
    "type": "object",
    "description": "Pagination metadata with 'page' (current page number), 'count' (total matching account rows), 'next'/'previous' (next/previous page numbers or null when unavailable), and 'hasNext'/'hasPrevious' booleans."
}

contract["examples"] = [
    {
        "request": {
            "method": "POST",
            "path": "/api/v2/awards/accounts/",
            "query": {},
            "body": {
                "award_id": "CONT_AWD_DEAC0500OR22725_8900_-NONE-_-NONE-",
                "limit": 3
            }
        },
        "response": {
            "status": 200,
            "body": {
                "results": [
                    {
                        "total_transaction_obligated_amount": 717064.18,
                        "federal_account": "089-5231",
                        "account_title": "Uranium Enrichment Decontamination and Decommissioning Fund, Energy Programs, Energy",
                        "funding_agency_abbreviation": "DOE",
                        "funding_agency_name": "Department of Energy",
                        "funding_agency_id": 930,
                        "funding_toptier_agency_id": 78,
                        "funding_agency_slug": "department-of-energy"
                    },
                    {
                        "total_transaction_obligated_amount": 3182500.0,
                        "federal_account": "089-5227",
                        "account_title": "Nuclear Waste Disposal, Energy Programs, Energy",
                        "funding_agency_abbreviation": "DOE",
                        "funding_agency_name": "Department of Energy",
                        "funding_agency_id": 930,
                        "funding_toptier_agency_id": 78,
                        "funding_agency_slug": "department-of-energy"
                    },
                    {
                        "total_transaction_obligated_amount": 738052872.3,
                        "federal_account": "089-4180",
                        "account_title": "Expenses, Isotope Production and Distribution Program Fund, Energy",
                        "funding_agency_abbreviation": "DOE",
                        "funding_agency_name": "Department of Energy",
                        "funding_agency_id": 930,
                        "funding_toptier_agency_id": 78,
                        "funding_agency_slug": "department-of-energy"
                    }
                ],
                "page_metadata": {
                    "page": 1,
                    "count": 28,
                    "next": 2,
                    "previous": None,
                    "hasNext": True,
                    "hasPrevious": False
                }
            }
        }
    },
    {
        "request": {
            "method": "POST",
            "path": "/api/v2/awards/accounts/",
            "query": {},
            "body": {}
        },
        "response": {
            "status": 422,
            "body": {
                "detail": "Missing value: 'award_id' is a required field"
            }
        }
    }
]

gaps = [g for g in gaps if "default 'limit'" not in g.lower()]

pass2_probes = [
    {
        "request": {
            "method": "POST",
            "path": "/api/v2/awards/accounts/",
            "query": {},
            "body": {
                "award_id": "CONT_AWD_DEAC0500OR22725_8900_-NONE-_-NONE-"
            }
        },
        "response": {
            "status": 200,
            "bodyExcerpt": "{\"results\":[{\"total_transaction_obligated_amount\":717064.18,\"federal_account\":\"089-5231\",\"account_title\":\"Uranium Enrichment Decontamination and Decommissioning Fund, Energy Programs, Energy\",\"funding_agency_abbreviation\":\"DOE\",\"funding_agency_name\":\"Department of Energy\",\"funding_agency_id\":930,\"funding_toptier_agency_id\":78,\"funding_agency_slug\":\"department-of-energy\"},{\"total_transaction_obligated_amount\":3182500.0,\"federal_account\":\"089-5227\",\"account_title\":\"Nuclear Waste Disposal, Energy Programs, Energy\",\"funding_agency_abbreviation\":\"DOE\",\"funding_agency_name\":\"Department of Energy\",\"funding_agency_id\":930,\"funding_toptier_agency_id\":78,\"funding_agency_slug\":\"department-of-energy\"},{\"total_transaction_obligated_amount\":738052872.3,\"federal_account\":\"089-4180\",\"account_title\":\"Expenses, Isotope Production and Distribution Program Fund, Energy\",\"funding_agency_abbreviation\":\"DOE\",\"funding_agency_name\":\"Department of Energy\",\"funding_agency_id\":930,\"funding_toptier_agency_id\":78,\"funding_agency_slug\":\"department-of-energy\"}],\"page_metadata\":{\"page\":1,\"count\":28,\"next\":2,\"previous\":null,\"hasNext\":true,\"hasPrevious\":false}}",
            "contentType": "application/json"
        },
        "notes": "pass2 - default limit returns 10 rows and exposes total count=28 while hasNext=true.",
        "meta": {"newFromPass2": True}
    },
    {
        "request": {
            "method": "POST",
            "path": "/api/v2/awards/accounts/",
            "query": {},
            "body": {
                "award_id": "CONT_AWD_DEAC0500OR22725_8900_-NONE-_-NONE-",
                "page": 2
            }
        },
        "response": {
            "status": 200,
            "bodyExcerpt": "{\"results\":[{\"total_transaction_obligated_amount\":59311156.55,\"federal_account\":\"089-0337\",\"account_title\":\"Advanced Research Projects Agency-Energy, Energy Programs, Energy\",\"funding_agency_abbreviation\":\"DOE\",\"funding_agency_name\":\"Department of Energy\",\"funding_agency_id\":930,\"funding_toptier_agency_id\":78,\"funding_agency_slug\":\"department-of-energy\"},{\"total_transaction_obligated_amount\":220352.63,\"federal_account\":\"089-0322\",\"account_title\":\"Advanced Technology Vehicles Manufacturing Loan Program, Energy Programs, Energy\",\"funding_agency_abbreviation\":\"DOE\",\"funding_agency_name\":\"Department of Energy\",\"funding_agency_id\":930,\"funding_toptier_agency_id\":78,\"funding_agency_slug\":\"department-of-energy\"}],\"page_metadata\":{\"page\":2,\"count\":28,\"next\":3,\"previous\":1,\"hasNext\":true,\"hasPrevious\":true}}",
            "contentType": "application/json"
        },
        "notes": "pass2 - pagination with default limit shows hasPrevious true and next page present.",
        "meta": {"newFromPass2": True}
    },
    {
        "request": {
            "method": "POST",
            "path": "/api/v2/awards/accounts/",
            "query": {},
            "body": {
                "award_id": "CONT_AWD_DEAC0500OR22725_8900_-NONE-_-NONE-",
                "page": 3
            }
        },
        "response": {
            "status": 200,
            "bodyExcerpt": "{\"results\":[{\"total_transaction_obligated_amount\":338313133.96,\"federal_account\":\"089-0243\",\"account_title\":\"Other Defense Activities, Environmental and Other Defense Activities, Energy\",\"funding_agency_abbreviation\":\"DOE\",\"funding_agency_name\":\"Department of Energy\",\"funding_agency_id\":930,\"funding_toptier_agency_id\":78,\"funding_agency_slug\":\"department-of-energy\"},{\"total_transaction_obligated_amount\":2217953159.52,\"federal_account\":\"089-0240\",\"account_title\":\"Weapons Activities, National Nuclear Security Administration, Energy\",\"funding_agency_abbreviation\":\"DOE\",\"funding_agency_name\":\"Department of Energy\",\"funding_agency_id\":930,\"funding_toptier_agency_id\":78,\"funding_agency_slug\":\"department-of-energy\"}],\"page_metadata\":{\"page\":3,\"count\":28,\"next\":null,\"previous\":2,\"hasNext\":false,\"hasPrevious\":true}}",
            "contentType": "application/json"
        },
        "notes": "pass2 - final page sets next=null and hasNext=false while preserving hasPrevious=true.",
        "meta": {"newFromPass2": True}
    },
    {
        "request": {
            "method": "POST",
            "path": "/api/v2/awards/accounts/",
            "query": {},
            "body": {
                "award_id": "CONT_AWD_DEAC0500OR22725_8900_-NONE-_-NONE-",
                "limit": 15
            }
        },
        "response": {
            "status": 200,
            "bodyExcerpt": "{\"results\":[{\"total_transaction_obligated_amount\":717064.18,\"federal_account\":\"089-5231\",\"account_title\":\"Uranium Enrichment Decontamination and Decommissioning Fund, Energy Programs, Energy\",\"funding_agency_abbreviation\":\"DOE\",\"funding_agency_name\":\"Department of Energy\",\"funding_agency_id\":930,\"funding_toptier_agency_id\":78,\"funding_agency_slug\":\"department-of-energy\"},{\"total_transaction_obligated_amount\":3182500.0,\"federal_account\":\"089-5227\",\"account_title\":\"Nuclear Waste Disposal, Energy Programs, Energy\",\"funding_agency_abbreviation\":\"DOE\",\"funding_agency_name\":\"Department of Energy\",\"funding_agency_id\":930,\"funding_toptier_agency_id\":78,\"funding_agency_slug\":\"department-of-energy\"},{\"total_transaction_obligated_amount\":738052872.3,\"federal_account\":\"089-4180\",\"account_title\":\"Expenses, Isotope Production and Distribution Program Fund, Energy\",\"funding_agency_abbreviation\":\"DOE\",\"funding_agency_name\":\"Department of Energy\",\"funding_agency_id\":930,\"funding_toptier_agency_id\":78,\"funding_agency_slug\":\"department-of-energy\"}],\"page_metadata\":{\"page\":1,\"count\":28,\"next\":2,\"previous\":null,\"hasNext\":true,\"hasPrevious\":false}}",
            "contentType": "application/json"
        },
        "notes": "pass2 - explicit limit=15 increases page size beyond default while honoring max<=100.",
        "meta": {"newFromPass2": True}
    },
    {
        "request": {
            "method": "POST",
            "path": "/api/v2/awards/accounts/",
            "query": {},
            "body": {
                "award_id": "CONT_AWD_DEAC0500OR22725_8900_-NONE-_-NONE-",
                "limit": 15,
                "page": 2
            }
        },
        "response": {
            "status": 200,
            "bodyExcerpt": "{\"results\":[{\"total_transaction_obligated_amount\":6552237.32,\"federal_account\":\"089-0315\",\"account_title\":\"Non-Defense Environmental Cleanup, Energy Programs, Energy\",\"funding_agency_abbreviation\":\"DOE\",\"funding_agency_name\":\"Department of Energy\",\"funding_agency_id\":930,\"funding_toptier_agency_id\":78,\"funding_agency_slug\":\"department-of-energy\"},{\"total_transaction_obligated_amount\":720000.0,\"federal_account\":\"089-0314\",\"account_title\":\"Naval Reactors, National Nuclear Security Administration, Energy\",\"funding_agency_abbreviation\":\"DOE\",\"funding_agency_name\":\"Department of Energy\",\"funding_agency_id\":930,\"funding_toptier_agency_id\":78,\"funding_agency_slug\":\"department-of-energy\"}],\"page_metadata\":{\"page\":2,\"count\":28,\"next\":null,\"previous\":1,\"hasNext\":false,\"hasPrevious\":true}}",
            "contentType": "application/json"
        },
        "notes": "pass2 - second page with custom limit verifies next=null behaviour when remaining rows < limit.",
        "meta": {"newFromPass2": True}
    },
    {
        "request": {
            "method": "POST",
            "path": "/api/v2/awards/accounts/",
            "query": {},
            "body": {
                "award_id": "ASST_NON_00030615_068"
            }
        },
        "response": {
            "status": 200,
            "bodyExcerpt": "{\"results\":[{\"total_transaction_obligated_amount\":196878.59,\"federal_account\":\"068-0103\",\"account_title\":\"State and Tribal Assistance Grants, Environmental Protection Agency\",\"funding_agency_abbreviation\":\"EPA\",\"funding_agency_name\":\"Environmental Protection Agency\",\"funding_agency_id\":700,\"funding_toptier_agency_id\":61,\"funding_agency_slug\":\"environmental-protection-agency\"}],\"page_metadata\":{\"page\":1,\"count\":1,\"next\":null,\"previous\":null,\"hasNext\":false,\"hasPrevious\":false}}",
            "contentType": "application/json"
        },
        "notes": "pass2 - assistance award ID works and returns funding_agency identifiers, confirming shape shared across award types.",
        "meta": {"newFromPass2": True}
    }
]

probes.extend(pass2_probes)

contract["quirks"] = [
    "Numeric string values for 'limit' and 'page' are auto-coerced to integers, but floats are rejected.",
    "Unexpected JSON keys in the request body are silently ignored rather than triggering validation errors.",
    "Requesting pages beyond the available data returns HTTP 200 with empty 'results' while 'page_metadata.page' echoes the requested page and 'hasPrevious' may remain true.",
    "GET requests to the resource respond with 405, enforcing POST-only usage.",
    "Default page size is 10 accounts when 'limit' is omitted."
]

if "Null cases for funding agency fields were not observed, so their runtime nullability remains unverified." not in gaps:
    gaps.append("Null cases for funding agency fields were not observed, so their runtime nullability remains unverified.")

risks = sorted({
    "Clients requesting more than 100 records per page will receive 422 errors and must paginate instead.",
    "Default 10-row pages mean clients seeking whole account lists should request a higher limit.",
    "High page numbers return empty arrays without an error, so callers must check 'results' length or 'hasNext' to detect exhaustion.",
    "Silently ignored extra body keys can hide typos in parameter names; client-side validation is advisable."
})

summary = {
    "schemaVersion": "1.0.0",
    "contract": contract,
    "probes": probes,
    "mismatches": mismatches,
    "gaps": gaps,
    "risks": risks,
    "deltas": {
        "added": ["Documented observed default limit via new DOE award probe."],
        "changed": [
            "Set contract confidence levels to observed and refreshed pagination details.",
            "Replaced primary example with high-volume award demonstrating pagination counts.",
            "Extended probe set with pass-two pagination and assistance award coverage."
        ],
        "removed": ["Gap about unknown default limit after confirming 10-row default."]
    }
}

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
OUTPUT_PATH.write_text(json.dumps(summary, indent=2))
