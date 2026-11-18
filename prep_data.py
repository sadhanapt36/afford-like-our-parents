"""
Builds the small, clean CSVs the web page loads.

Input  (from ../final-project-proposal/data, made by make_proposal_charts.py):
  acs_metro_panel.csv   one row per metro per year, ACS 1-year estimates
  fred_national.csv     national yearly series from FRED
Output (./data):
  metros.csv            one row per metro per year, with a stable metro key
  national.csv          national yearly series (1984-latest)

Run:  python prep_data.py
"""
import os
import pandas as pd

SRC = os.path.join("..", "final-project-proposal", "data")
os.makedirs("data", exist_ok=True)

# ---- metros -------------------------------------------------------------------
acs = pd.read_csv(os.path.join(SRC, "acs_metro_panel.csv"))


def key(name):
    """'Los Angeles-Long Beach-Anaheim, CA Metro Area' -> 'Los Angeles, CA'.
    Metro codes and full names change between years, so we match on the
    principal city and its state instead."""
    city = name.split(",")[0].split("-")[0].strip()
    state = name.split(",")[1].strip().split("-")[0].split(" ")[0] if "," in name else ""
    return f"{city}, {state}"


acs["metro"] = acs["metro_name"].map(key)
# Puerto Rico metros are left out: their names don't parse cleanly and incomes
# aren't comparable with the 50 states.
acs = acs[~acs["metro"].str.endswith(", PR")]
# If two areas map to the same key in a year, keep the bigger one.
acs = (acs.sort_values("population", ascending=False)
          .drop_duplicates(["metro", "year"])
          .sort_values(["metro", "year"]))

metros = acs.rename(columns={
    "median_household_income": "income",
    "median_gross_rent": "rent",
    "median_home_value": "home_value",
    "rent_pct_of_income": "rent_burden",
})[["metro", "year", "population", "income", "rent", "home_value", "rent_burden"]]
metros["population"] = metros["population"].astype(int)
metros.to_csv("data/metros.csv", index=False)
print(f"data/metros.csv: {len(metros)} rows, {metros['metro'].nunique()} metros, "
      f"{metros['year'].min()}-{metros['year'].max()}")

# ---- national -----------------------------------------------------------------
nat = pd.read_csv(os.path.join(SRC, "fred_national.csv"))
nat = nat.dropna(subset=["home_price", "income", "cpi_rent", "cpi_all"])
nat = nat[["year", "home_price", "income", "cpi_rent", "cpi_all"]].round(2)
nat.to_csv("data/national.csv", index=False)
print(f"data/national.csv: {len(nat)} rows, {nat['year'].min()}-{nat['year'].max()}")
