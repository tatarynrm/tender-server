export const POSTGRES_SCHEMA = `
Here is the COMPLETE PostgreSQL database schema (Tender Platform):

- Table: company (Business partners / companies)
  Columns: id (bigint PK), company_name (varchar), edrpou (varchar), black_list (bool), is_blocked (bool), is_carrier (bool), is_client (bool), address (varchar), ids_country (varchar), use_medok (bool), use_vchasno (bool), web_site (varchar)
- Table: person (Individuals / employees of partners)
  Columns: id (bigint PK), surname (varchar), name (varchar), last_name (varchar / patronymic), email (varchar), id_company (bigint FK company.id), position (varchar)
- Table: person_role (Access roles of individuals)
  Columns: id (bigint PK), id_person (bigint FK person.id), is_admin (bool), is_ict (bool), is_manager (bool)
- Table: person_phone (Contact phones)
  Columns: id (bigint PK), id_person (bigint FK person.id), phone (varchar), is_telegram (bool), is_viber (bool), is_whatsapp (bool)
- Table: person_telegram (Telegram accounts links)
  Columns: id (bigint PK), telegram_id (bigint), username (varchar), id_person (bigint FK person.id)
- Table: vehicle (Trucks / vehicles registered by carriers)
  Columns: id (bigint PK), carnum (varchar), id_company (bigint FK company.id), ids_trailer_type (varchar), vin (varchar), year_release (int)
- Table: tender (Cargo listings created by clients for bidding)
  Columns: id (bigint PK), cargo (varchar), id_owner_company (bigint FK company.id), price_start (numeric), price_step (numeric), price_redemption (numeric), price_client (numeric), weight (numeric), volume (numeric), date_load (timestamp), date_unload (timestamp), time_start (timestamp), time_end (timestamp)
- Table: tender_lst (Routes, countries and current status of each tender)
  Columns: id (bigint PK), id_tender (bigint FK tender.id), city_from (varchar), city_to (varchar), ids_country_from (varchar), ids_country_to (varchar), ids_status (varchar e.g. ACTIVE, CLOSED), car_count_all (int), car_count_actual (int), car_count_closed (int)
- Table: tender_rate (Bids/offers proposed by carriers)
  Columns: id (bigint PK), id_tender (bigint FK tender.id), id_company (bigint FK company.id), price_proposed (numeric), time_add (timestamp), id_author (bigint FK person.id)
- Table: tender_winner (Assigned winners for each tender)
  Columns: id (bigint PK), id_tender (bigint FK tender.id), id_company (bigint FK company.id), id_person (bigint FK person.id), id_tender_rate (bigint FK tender_rate.id), car_count (int)
- Table: crm_load (Client cargo bookings)
  Columns: id (bigint PK), id_client (bigint FK company.id), price (numeric), date_load (date), date_unload (date), load_info (text)
- Table: department (Company departments)
  Columns: id (bigint PK), department_name (varchar), id_company (bigint FK company.id)
- Table: files (Uploaded attachments / scans)
  Columns: id (bigint PK), display_name (varchar), extension (varchar), file_size (bigint), url (text), tblref (varchar e.g. company, tender), id_tblref (bigint)
- Table: usr (Web login credentials)
  Columns: id (bigint PK), email (varchar), password_hash (varchar), id_person (bigint FK person.id), is_blocked (bool)

RELATIONSHIPS AND JOINS GUIDE (PostgreSQL):
- To join a tender with its routes/statuses:
  JOIN tender_lst ON tender.id = tender_lst.id_tender
- To join a tender with bids (rates) submitted:
  JOIN tender_rate ON tender.id = tender_rate.id_tender
- To join a tender with its winner:
  JOIN tender_winner ON tender.id = tender_winner.id_tender
- To join a rate with the company that proposed it:
  JOIN company ON tender_rate.id_company = company.id
- To join a person (employee) with their company:
  JOIN company ON person.id_company = company.id
- To check roles for a person:
  JOIN person_role ON person.id = person_role.id_person
- To join a person with their Telegram link:
  JOIN person_telegram ON person.id = person_telegram.id_person
- To join a vehicle with its owner company:
  JOIN company ON vehicle.id_company = company.id
`;

export const ORACLE_SCHEMA = `
Here is the COMPLETE Oracle database schema (ERP / Finance - CURRENT_SCHEMA = ICTDAT):

- Table: FIRMA (Our internal legal entities)
  Columns: KOD (NUMBER PK), NFIRMA (VARCHAR2 - company name), KOD_UR (NUMBER - legal status)
- Table: PEREV (Carrier directory)
  Columns: KOD (NUMBER PK), NUMDOC (VARCHAR2), DATDOC (DATE), KOD_FIRMA (NUMBER FK FIRMA(KOD)), KOD_CAT (NUMBER)
- Table: DOG (Contracts with clients / carriers)
  Columns: KOD (NUMBER PK), NUMDOC (VARCHAR2 - contract number), DATDOC (DATE - contract date), ZMIST (VARCHAR2 - content), TERMIN (DATE - end date), KOD_FIRMA (NUMBER FK FIRMA(KOD)), KOD_OS (NUMBER FK OS(KOD))
- Table: ZAY (Transport requests / carrier orders)
  Columns: KOD (NUMBER PK), NUMDOC (VARCHAR2 - doc number), DATDOC (DATE - doc date), VANTAZH (VARCHAR2 - cargo), VANTTON (NUMBER - weight tons), VANTOBJEM (NUMBER - volume m3), ZAMSUMA (NUMBER - customer price), PERSUMA (NUMBER - carrier price), KOD_ZAM (NUMBER - customer company), KOD_PER (NUMBER FK PEREV(KOD)), DATZAV (DATE - load date), DATROZV (DATE - unload date), MARSH (VARCHAR2 - route), PUNKTZ (VARCHAR2 - load town), PUNKTR (VARCHAR2 - unload town), AM (VARCHAR2 - truck plate), PR (VARCHAR2 - trailer plate), VOD1 (VARCHAR2 - driver name), VOD1TEL (VARCHAR2 - driver phone)
- Table: PRET (Claims / financial penalties)
  Columns: KOD (NUMBER PK), NUMDOC (VARCHAR2), DATDOC (DATE), SUMA (NUMBER - claim amount), PRIM (VARCHAR2 - note)
- Table: KONTAKT (External contact persons)
  Columns: KOD (NUMBER PK), NKONTAKT (VARCHAR2 - name), TEL (VARCHAR2 - phone), EMAIL (VARCHAR2)
- Table: OS (Our staff / employees directory)
  Columns: KOD (NUMBER PK), NOS (VARCHAR2 - full name), KOD_DEP (NUMBER)
- Table: ACTVR (Client delivery acceptance acts)
  Columns: KOD (NUMBER PK), NUMDOC (VARCHAR2), DATDOC (DATE), SUMA (NUMBER), KOD_UR (NUMBER), KOD_RAHZAM (NUMBER)
- Table: AVRMONCLIENT (Monthly customer billing summaries)
  Columns: KOD (NUMBER PK), NUMDOC (VARCHAR2), DATDOC (DATE), SUMA (NUMBER), KOD_DOG (NUMBER FK DOG(KOD)), KOD_UR (NUMBER)
- Table: BANKP (Bank payments received)
  Columns: KOD (NUMBER PK), NUMDOC (VARCHAR2), DATDOC (DATE), SUMA (NUMBER), KOD_VALUT (NUMBER), KOD_ZAY (NUMBER FK ZAY(KOD))
- Table: BANKV (Currency exchange transactions / payments)
  Columns: KOD (NUMBER PK), NUMDOC (VARCHAR2), SUMAGRN (NUMBER), SUMAZAKR (NUMBER), ODER_NAME (VARCHAR2), PLAT_NAME (VARCHAR2)
- Table: CABPER_STAT_MAIN (Carrier portal statistics summary)
  Columns: KOD_PER (NUMBER PK FK PEREV(KOD)), ZAY_COUNT_ALL (NUMBER), ZAY_COUNT_ACTIVE (NUMBER), OBOROT (NUMBER - turnover), ZAY_DATE_LAST (DATE)
- Table: KRAINA (Countries dictionary)
  Columns: KOD (NUMBER PK), NKRAINA (VARCHAR2 - country name), CODE (VARCHAR2 - country code)
- Table: OBL (Regions / Oblasts dictionary)
  Columns: KOD (NUMBER PK), NOBL (VARCHAR2 - region name), KOD_KRAINA (NUMBER FK KRAINA(KOD))
- Table: TOWN (Cities directory)
  Columns: KOD (NUMBER PK), NTOWN (VARCHAR2 - town name), KOD_OBL (NUMBER FK OBL(KOD))
- Table: VALUT (Currencies dictionary)
  Columns: KOD (NUMBER PK), NVALUT (VARCHAR2 - currency name), CODE (VARCHAR2 - currency short code e.g. USD, EUR, UAH)
- Table: VALUTCURS (Currency exchange rates)
  Columns: KOD (NUMBER PK), KOD_VALUT (NUMBER FK VALUT(KOD)), DAT (DATE), CURS (NUMBER)

RELATIONSHIPS AND JOINS GUIDE (Oracle):
- To join an Order (ZAY) with its assigned Carrier (PEREV):
  FROM ZAY JOIN PEREV ON ZAY.KOD_PER = PEREV.KOD
- To join a Carrier (PEREV) with its Legal Entity Company details:
  FROM PEREV JOIN FIRMA ON PEREV.KOD_FIRMA = FIRMA.KOD
- To join an Order (ZAY) with Customer/Client Company details:
  FROM ZAY JOIN FIRMA ON ZAY.KOD_ZAM = FIRMA.KOD
- To join a Contract (DOG) with its signatory Company details:
  FROM DOG JOIN FIRMA ON DOG.KOD_FIRMA = FIRMA.KOD
- To join a Contract (DOG) with its managing internal employee:
  FROM DOG JOIN OS ON DOG.KOD_OS = OS.KOD
- To join an Order (ZAY) with a bank payment received:
  FROM ZAY JOIN BANKP ON ZAY.KOD = BANKP.KOD_ZAY
- To join cities, regions and countries:
  FROM TOWN JOIN OBL ON TOWN.KOD_OBL = OBL.KOD
  JOIN KRAINA ON OBL.KOD_KRAINA = KRAINA.KOD
- To join currency details in exchange rates:
  FROM VALUTCURS JOIN VALUT ON VALUTCURS.KOD_VALUT = VALUT.KOD
`;

