CREATE TABLE flight_leg_contract (
  flight_leg_id TEXT NOT NULL REFERENCES flight_leg(flight_leg_id) ON DELETE CASCADE,
  company_contract_id TEXT NOT NULL REFERENCES company_contract(company_contract_id) ON DELETE CASCADE,
  attachment_order INTEGER NOT NULL,
  PRIMARY KEY (flight_leg_id, company_contract_id)
);

CREATE INDEX idx_flight_leg_contract_company_contract
ON flight_leg_contract(company_contract_id, flight_leg_id);

INSERT INTO flight_leg_contract (
  flight_leg_id,
  company_contract_id,
  attachment_order
)
SELECT
  flight_leg_id,
  linked_company_contract_id,
  0
FROM flight_leg
WHERE linked_company_contract_id IS NOT NULL;
