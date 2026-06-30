/**
 * 数据库模式定义，包含操作员、设备、样品、试验、传感器和校准记录表。
 */
export const schemaSql = `
CREATE TABLE IF NOT EXISTS "operators" (
    "userid"    TEXT NOT NULL,
    "username"  TEXT NOT NULL,
    "pwd"       TEXT NOT NULL,
    "usertype"  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "apparatus" (
    "apparatusid"   INTEGER NOT NULL CONSTRAINT "PK_apparatus" PRIMARY KEY,
    "innernumber"   TEXT NOT NULL,
    "apparatusname" TEXT NOT NULL,
    "checkdatef"    date NOT NULL,
    "checkdatet"    date NOT NULL,
    "pidport"       TEXT NOT NULL,
    "powerport"     TEXT NOT NULL,
    "constpower"    INTEGER NULL
);

CREATE TABLE IF NOT EXISTS "productmaster" (
    "productid"   TEXT NOT NULL CONSTRAINT "PK_productmaster" PRIMARY KEY,
    "productname" TEXT NOT NULL,
    "specific"    TEXT NOT NULL,
    "diameter"    REAL NOT NULL,
    "height"      REAL NOT NULL,
    "flag"        TEXT NULL
);

CREATE TABLE IF NOT EXISTS "testmaster" (
    "productid"        TEXT NOT NULL,
    "testid"           TEXT NOT NULL,
    "testdate"         date NOT NULL,
    "ambtemp"          REAL NOT NULL,
    "ambhumi"          REAL NOT NULL,
    "according"        TEXT NOT NULL,
    "operator"         TEXT NOT NULL,
    "apparatusid"      TEXT NOT NULL,
    "apparatusname"    TEXT NOT NULL,
    "apparatuschkdate" date NOT NULL,
    "rptno"            TEXT NOT NULL,
    "preweight"        REAL NOT NULL,
    "postweight"       REAL NOT NULL,
    "lostweight"       REAL NOT NULL,
    "lostweight_per"   REAL NOT NULL,
    "totaltesttime"    INTEGER NOT NULL,
    "constpower"       INTEGER NOT NULL,
    "phenocode"        TEXT NOT NULL,
    "flametime"        INTEGER NOT NULL,
    "flameduration"    INTEGER NOT NULL,
    "maxtf1"           REAL NOT NULL,
    "maxtf2"           REAL NOT NULL,
    "maxts"            REAL NOT NULL,
    "maxtc"            REAL NOT NULL,
    "maxtf1_time"      INTEGER NOT NULL,
    "maxtf2_time"      INTEGER NOT NULL,
    "maxts_time"       INTEGER NOT NULL,
    "maxtc_time"       INTEGER NOT NULL,
    "finaltf1"         REAL NOT NULL,
    "finaltf2"         REAL NOT NULL,
    "finalts"          REAL NOT NULL,
    "finaltc"          REAL NOT NULL,
    "finaltf1_time"    INTEGER NOT NULL,
    "finaltf2_time"    INTEGER NOT NULL,
    "finalts_time"     INTEGER NOT NULL,
    "finaltc_time"     INTEGER NOT NULL,
    "deltatf1"         REAL NOT NULL,
    "deltatf2"         REAL NOT NULL,
    "deltatf"          REAL NOT NULL,
    "deltats"          REAL NOT NULL,
    "deltatc"          REAL NOT NULL,
    "memo"             TEXT NULL,
    "flag"             TEXT NULL,
    CONSTRAINT "PK_testmaster" PRIMARY KEY ("productid", "testid"),
    CONSTRAINT "FK_testmaster_productmaster" FOREIGN KEY ("productid") REFERENCES "productmaster" ("productid")
);

CREATE INDEX IF NOT EXISTS "IX_Testmaster_Testdate" ON "testmaster" ("testdate");
CREATE INDEX IF NOT EXISTS "IX_Testmaster_Operator" ON "testmaster" ("operator");
CREATE INDEX IF NOT EXISTS "IX_Testmaster_Testdate_Productid" ON "testmaster" ("testdate", "productid");

CREATE TABLE IF NOT EXISTS "sensors" (
    "sensorid"    INTEGER NOT NULL CONSTRAINT "PK_sensors" PRIMARY KEY,
    "sensorname"  TEXT NOT NULL,
    "dispname"    TEXT NOT NULL,
    "sensorgroup" TEXT NOT NULL,
    "unit"        TEXT NOT NULL,
    "discription" TEXT NOT NULL,
    "flag"        TEXT NOT NULL,
    "signalzero"  REAL NOT NULL,
    "signalspan"  REAL NOT NULL,
    "outputzero"  REAL NOT NULL,
    "outputspan"  REAL NOT NULL,
    "outputvalue" REAL NOT NULL,
    "inputvalue"  REAL NOT NULL,
    "signaltype"  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "CalibrationRecords" (
    "Id" TEXT NOT NULL CONSTRAINT "PK_CalibrationRecords" PRIMARY KEY,
    "CalibrationDate" TEXT NOT NULL,
    "CalibrationType" TEXT NOT NULL,
    "ApparatusId" INTEGER NOT NULL,
    "Operator" TEXT NOT NULL,
    "TemperatureData" TEXT NOT NULL,
    "UniformityResult" REAL NULL,
    "MaxDeviation" REAL NULL,
    "AverageTemperature" REAL NULL,
    "PassedCriteria" INTEGER NOT NULL,
    "Remarks" TEXT NOT NULL,
    "CreatedAt" TEXT NOT NULL,
    "TempA1" REAL NULL, "TempA2" REAL NULL, "TempA3" REAL NULL,
    "TempB1" REAL NULL, "TempB2" REAL NULL, "TempB3" REAL NULL,
    "TempC1" REAL NULL, "TempC2" REAL NULL, "TempC3" REAL NULL,
    "TAvg" REAL NULL,
    "TAvgAxis1" REAL NULL, "TAvgAxis2" REAL NULL, "TAvgAxis3" REAL NULL,
    "TAvgLevela" REAL NULL, "TAvgLevelb" REAL NULL, "TAvgLevelc" REAL NULL,
    "TDevAxis1" REAL NULL, "TDevAxis2" REAL NULL, "TDevAxis3" REAL NULL,
    "TDevLevela" REAL NULL, "TDevLevelb" REAL NULL, "TDevLevelc" REAL NULL,
    "TAvgDevAxis" REAL NULL, "TAvgDevLevel" REAL NULL,
    "CenterTempData" TEXT NULL,
    "Memo" TEXT NULL
);

CREATE INDEX IF NOT EXISTS "IX_CalibrationRecord_Date" ON "CalibrationRecords" ("CalibrationDate");
CREATE INDEX IF NOT EXISTS "IX_CalibrationRecord_Operator" ON "CalibrationRecords" ("Operator");

INSERT INTO operators (userid, username, pwd, usertype)
SELECT '1', 'admin', '123456', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM operators WHERE username = 'admin');

INSERT INTO operators (userid, username, pwd, usertype)
SELECT '2', 'experimenter', '123456', 'operator'
WHERE NOT EXISTS (SELECT 1 FROM operators WHERE username = 'experimenter');

INSERT INTO apparatus (apparatusid, innernumber, apparatusname, checkdatef, checkdatet, pidport, powerport, constpower)
SELECT 0, 'FURNACE-01', '一号试验炉', date('now'), date('now', '+1 year'), 'COM9', 'COM9', 2048
WHERE NOT EXISTS (SELECT 1 FROM apparatus WHERE apparatusid = 0);

INSERT INTO sensors VALUES (0,'Sensor0','炉温1','采集','℃','炉温1','启用',0,0,0,1000,0,0,4)
ON CONFLICT(sensorid) DO NOTHING;
INSERT INTO sensors VALUES (1,'Sensor1','炉温2','采集','℃','炉温2','启用',0,0,0,1000,0,0,4)
ON CONFLICT(sensorid) DO NOTHING;
INSERT INTO sensors VALUES (2,'Sensor2','表面温度','采集','℃','表面温度','启用',0,0,0,1000,0,0,4)
ON CONFLICT(sensorid) DO NOTHING;
INSERT INTO sensors VALUES (3,'Sensor3','中心温度','采集','℃','中心温度','启用',0,0,0,1000,0,0,4)
ON CONFLICT(sensorid) DO NOTHING;
INSERT INTO sensors VALUES (16,'Sensor16','校准温度','校准','℃','校准温度','启用',0,0,0,1000,0,0,4)
ON CONFLICT(sensorid) DO NOTHING;
`;
