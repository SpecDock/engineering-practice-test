# 数据库设计文档（SQLite 真实结构）

> 来源：结合当前代码中的 EF 模型、`DatabaseHelper` 首次运行初始化逻辑，以及程序运行后的 SQLite 表结构整理。
> 数据库引擎：**SQLite**，路径由 `appsettings.json → Database.SqlitePath` 配置（默认 `Data\ISO11820.db`）。

---

## 一、表清单

| 表名 | 说明 |
|------|------|
| `operators` | 操作员/用户账号 |
| `apparatus` | 试验设备信息 |
| `productmaster` | 样品信息 |
| `testmaster` | 试验记录（核心表）|
| `sensors` | 传感器通道配置 |
| `CalibrationRecords` | 设备校准历史 |

---

## 二、完整建表 SQL

### operators（操作员表）
> ⚠️ 此表**没有主键约束**，密码是**明文存储**。

```sql
CREATE TABLE IF NOT EXISTS "operators" (
    "userid"    TEXT NOT NULL,   -- 用户ID，当前初始化为 1、2
    "username"  TEXT NOT NULL,   -- 登录用户名，如 admin、experimenter
    "pwd"       TEXT NOT NULL,   -- 明文密码，当前默认 123456
    "usertype"  TEXT NOT NULL    -- 角色：admin 或 operator
);
```

> 当前代码登录时查询 `username + pwd`，不是 `userid + pwd`。

---

### apparatus（设备表）

```sql
CREATE TABLE IF NOT EXISTS "apparatus" (
    "apparatusid"   INTEGER NOT NULL CONSTRAINT "PK_apparatus" PRIMARY KEY,
    "innernumber"   TEXT NOT NULL,       -- 设备内部编号，如 FURNACE-01
    "apparatusname" TEXT NOT NULL,       -- 设备名称，如 一号试验炉
    "checkdatef"    date NOT NULL,       -- 检定有效期开始
    "checkdatet"    date NOT NULL,       -- 检定有效期结束
    "pidport"       TEXT NOT NULL,       -- PID串口，如 COM9
    "powerport"     TEXT NOT NULL,       -- 功率串口，如 COM9
    "constpower"    INTEGER NULL         -- 上次记录的恒功率值（可空）
);
```

---

### productmaster（样品表）

```sql
CREATE TABLE IF NOT EXISTS "productmaster" (
    "productid"   TEXT NOT NULL CONSTRAINT "PK_productmaster" PRIMARY KEY,  -- 样品编号，如 20240613-001
    "productname" TEXT NOT NULL,   -- 样品名称，如 岩棉隔热板
    "specific"    TEXT NOT NULL,   -- 规格型号，如 100×50×25mm
    "diameter"    REAL NOT NULL,   -- 直径（mm）
    "height"      REAL NOT NULL,   -- 高度（mm）
    "flag"        TEXT NULL        -- 备用字段
);
```

---

### testmaster（试验记录表）⭐ 核心表

> 主键：`(productid, testid)` 联合主键
> 外键：`productid` → `productmaster.productid`

```sql
CREATE TABLE IF NOT EXISTS "testmaster" (

    -- ===== 基本信息 =====
    "productid"        TEXT NOT NULL,           -- 样品编号（联合主键 + 外键）
    "testid"           TEXT NOT NULL,           -- 试验ID，格式 yyyyMMdd-HHmmss
    "testdate"         date NOT NULL,           -- 试验日期
    "ambtemp"          REAL NOT NULL,           -- 环境温度（°C）
    "ambhumi"          REAL NOT NULL,           -- 环境湿度（%）
    "according"        TEXT NOT NULL,           -- 试验依据，如 ISO 11820:2022
    "operator"         TEXT NOT NULL,           -- 操作员用户名
    "apparatusid"      TEXT NOT NULL,           -- 设备编号
    "apparatusname"    TEXT NOT NULL,           -- 设备名称（冗余，省去关联查询）
    "apparatuschkdate" date NOT NULL,           -- 设备检定日期
    "rptno"            TEXT NOT NULL,           -- 报告编号

    -- ===== 质量数据 =====
    "preweight"        REAL NOT NULL,           -- 试验前质量（g）
    "postweight"       REAL NOT NULL,           -- 试验后质量（g）
    "lostweight"       REAL NOT NULL,           -- 失重量 = preweight - postweight
    "lostweight_per"   REAL NOT NULL,           -- 【判定项】失重率（%）
    
    -- ===== 试验过程 =====
    "totaltesttime"    INTEGER NOT NULL,         -- 总试验时长（秒）
    "constpower"       INTEGER NOT NULL,         -- 恒功率值（0~25600）
    "phenocode"        TEXT NOT NULL,           -- 现象编码（勾选项序列化字符串）
    "flametime"        INTEGER NOT NULL,         -- 火焰开始时刻（秒，无火焰填0）
    "flameduration"    INTEGER NOT NULL,         -- 火焰持续时间（秒，无火焰填0）

    -- ===== 各通道温度最大值 =====
    "maxtf1"           REAL NOT NULL,           -- 炉温1最大值（°C）
    "maxtf2"           REAL NOT NULL,           -- 炉温2最大值
    "maxts"            REAL NOT NULL,           -- 表面温最大值
    "maxtc"            REAL NOT NULL,           -- 中心温最大值
    "maxtf1_time"      INTEGER NOT NULL,         -- 炉温1最大值时刻（秒）
    "maxtf2_time"      INTEGER NOT NULL,
    "maxts_time"       INTEGER NOT NULL,
    "maxtc_time"       INTEGER NOT NULL,

    -- ===== 各通道温度最终值（试验结束时刻）=====
    "finaltf1"         REAL NOT NULL,
    "finaltf2"         REAL NOT NULL,
    "finalts"          REAL NOT NULL,
    "finaltc"          REAL NOT NULL,
    "finaltf1_time"    INTEGER NOT NULL,
    "finaltf2_time"    INTEGER NOT NULL,
    "finalts_time"     INTEGER NOT NULL,
    "finaltc_time"     INTEGER NOT NULL,

    -- ===== 温升（结束值 - 开始值）=====
    "deltatf1"         REAL NOT NULL,           -- 炉温1温升
    "deltatf2"         REAL NOT NULL,           -- 炉温2温升
    "deltatf"          REAL NOT NULL,           -- 【判定项】样品温升（°C），当前代码取表面温升 deltats
    "deltats"          REAL NOT NULL,           -- 表面温温升
    "deltatc"          REAL NOT NULL,           -- 中心温温升

    -- ===== 备注 =====
    "memo"             TEXT NULL,               -- 备注（可空）
    "flag"             TEXT NULL,               -- 备用字段（可空）

    CONSTRAINT "PK_testmaster" PRIMARY KEY ("productid", "testid"),
    CONSTRAINT "FK_testmaster_productmaster" FOREIGN KEY ("productid") REFERENCES "productmaster" ("productid")
);

-- 索引
CREATE INDEX "IX_Testmaster_Testdate"            ON "testmaster" ("testdate");
CREATE INDEX "IX_Testmaster_Operator"            ON "testmaster" ("operator");
CREATE INDEX "IX_Testmaster_Testdate_Productid"  ON "testmaster" ("testdate", "productid");
```

---

### sensors（传感器配置表）

```sql
CREATE TABLE IF NOT EXISTS "sensors" (
    "sensorid"    INTEGER NOT NULL CONSTRAINT "PK_sensors" PRIMARY KEY,
    "sensorname"  TEXT NOT NULL,   -- 传感器代号，如 TF1
    "dispname"    TEXT NOT NULL,   -- 显示名，如 炉内温度1
    "sensorgroup" TEXT NOT NULL,   -- 分组标识
    "unit"        TEXT NOT NULL,   -- 单位，如 ℃
    "discription" TEXT NOT NULL,   -- 描述
    "flag"        TEXT NOT NULL,   -- 标记（当前初始化为 启用）
    "signalzero"  REAL NOT NULL,   -- 信号零点
    "signalspan"  REAL NOT NULL,   -- 信号量程
    "outputzero"  REAL NOT NULL,   -- 输出温度下限（如 0）
    "outputspan"  REAL NOT NULL,   -- 输出温度上限（如 1000）
    "outputvalue" REAL NOT NULL,   -- 当前温度值（运行时更新）
    "inputvalue"  REAL NOT NULL,   -- 当前输入值（运行时更新）
    "signaltype"  INTEGER NOT NULL -- 信号类型：4=数字量（仿真用）
);
```

---

### CalibrationRecords（校准记录表）

```sql
CREATE TABLE IF NOT EXISTS "CalibrationRecords" (
    "Id"                 TEXT NOT NULL CONSTRAINT "PK_CalibrationRecords" PRIMARY KEY,  -- GUID
    "CalibrationDate"    TEXT NOT NULL,   -- 校准日期时间（ISO 8601字符串）
    "CalibrationType"    TEXT NOT NULL,   -- 类型：Surface 或 Center
    "ApparatusId"        INTEGER NOT NULL, -- 设备ID
    "Operator"           TEXT NOT NULL,   -- 操作员
    "TemperatureData"    TEXT NOT NULL,   -- JSON字符串，见格式说明
    "UniformityResult"   REAL NULL,
    "MaxDeviation"       REAL NULL,
    "AverageTemperature" REAL NULL,
    "PassedCriteria"     INTEGER NOT NULL, -- 0=未通过，1=通过
    "Remarks"            TEXT NOT NULL,
    "CreatedAt"          TEXT NOT NULL,

    -- 炉壁9测温点（A/B/C层 × 1/2/3轴）
    "TempA1" REAL NULL, "TempA2" REAL NULL, "TempA3" REAL NULL,
    "TempB1" REAL NULL, "TempB2" REAL NULL, "TempB3" REAL NULL,
    "TempC1" REAL NULL, "TempC2" REAL NULL, "TempC3" REAL NULL,

    -- 计算结果
    "TAvg"        REAL NULL,   -- 总均温
    "TAvgAxis1"   REAL NULL,   "TAvgAxis2" REAL NULL,   "TAvgAxis3" REAL NULL,
    "TAvgLevela"  REAL NULL,   "TAvgLevelb" REAL NULL,  "TAvgLevelc" REAL NULL,
    "TDevAxis1"   REAL NULL,   "TDevAxis2" REAL NULL,   "TDevAxis3" REAL NULL,
    "TDevLevela"  REAL NULL,   "TDevLevelb" REAL NULL,  "TDevLevelc" REAL NULL,
    "TAvgDevAxis" REAL NULL,   "TAvgDevLevel" REAL NULL,

    "CenterTempData" TEXT NULL,   -- 中心轴JSON数据（可空）
    "Memo"           TEXT NULL
);

CREATE INDEX "IX_CalibrationRecord_Date"     ON "CalibrationRecords" ("CalibrationDate");
CREATE INDEX "IX_CalibrationRecord_Operator" ON "CalibrationRecords" ("Operator");
```

---

## 三、初始数据（程序首次运行时写入）

```sql
-- 操作员（当前代码首次运行时写入）
INSERT INTO operators (userid, username, pwd, usertype)
SELECT '1', 'admin', '123456', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM operators WHERE username = 'admin');

INSERT INTO operators (userid, username, pwd, usertype)
SELECT '2', 'experimenter', '123456', 'operator'
WHERE NOT EXISTS (SELECT 1 FROM operators WHERE username = 'experimenter');

-- 设备
INSERT INTO apparatus VALUES (0, 'FURNACE-01', '一号试验炉',
    date('now'), date('now', '+1 year'), 'COM9', 'COM9', 2048);

-- 传感器（当前代码初始化 0~16 共17个通道；业务主要使用 0、1、2、3、16）
INSERT INTO sensors VALUES (0,'Sensor0','炉温1','采集','℃','炉温1','启用',0,0,0,1000,0,0,4);
INSERT INTO sensors VALUES (1,'Sensor1','炉温2','采集','℃','炉温2','启用',0,0,0,1000,0,0,4);
INSERT INTO sensors VALUES (2,'Sensor2','表面温度','采集','℃','表面温度','启用',0,0,0,1000,0,0,4);
INSERT INTO sensors VALUES (3,'Sensor3','中心温度','采集','℃','中心温度','启用',0,0,0,1000,0,0,4);
INSERT INTO sensors VALUES (16,'Sensor16','校准温度','校准','℃','校准温度','启用',0,0,0,1000,0,0,4);
-- 其余 4~15 为备用通道，显示名为“备用通道{sensorId + 1}”
```

---

## 四、温度时序数据（不入库，存 CSV 文件）

每次试验的逐秒温度数据存为独立 CSV 文件，**不写入数据库**。

```
存储路径：{BaseDirectory}\TestData\{productid}\{testid}\sensor_data.csv

格式（每行代表1秒）：
Time, Temp1, Temp2, TempSurface, TempCenter, TempCalibration
0,    25.0,  24.9,  24.5,        24.3,        25.1
1,    30.1,  30.0,  24.6,        24.4,        25.0
...
3600, 750.2, 749.8, 620.5,       480.1,       751.0
```

报告生成模块读取此 CSV 文件来绘制 Excel/PDF 中的曲线图。

---

## 五、关键设计注意事项

| 问题 | 说明 |
|------|------|
| `operators` 无主键 | 当前登录查询用 `WHERE username = 'admin'`，不要把 `userid` 当登录名 |
| `testmaster` 联合主键 | 查询需要同时提供 `productid` + `testid` |
| `testmaster` 大部分字段在试验结束后才写入 | 新建试验时这些统计字段全部填 0，完成后再执行 UPDATE |
| `testmaster.flag` 完成标记 | 当前代码用 `10000000` 表示试验记录已保存，未保存完成记录会阻止新建试验 |
| `CalibrationRecords.TemperatureData` 是 JSON 字符串 | 写入时手动 `JsonSerializer.Serialize()`，读取时手动 `Deserialize()` |
| `CalibrationRecords` 表名大写开头 | 与其他表小写不同，注意区分大小写 |

---

## 六、直接 SQLite 操作示例

推荐封装一个 `DbHelper` 类统一管理数据库连接，避免到处撤居连接字符串。

```csharp
// 安装： dotnet add package Microsoft.Data.Sqlite
using Microsoft.Data.Sqlite;

public class DbHelper
{
    private readonly string _connStr;

    public DbHelper(string dbPath)
    {
        _connStr = $"Data Source={dbPath}";
    }

    // ===== 登录验证 =====
    public bool Login(string username, string pwd, out string userid, out string usertype)
    {
        userid = ""; usertype = "";
        using var conn = new SqliteConnection(_connStr);
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT userid, usertype FROM operators WHERE username=$name AND pwd=$pwd";
        cmd.Parameters.AddWithValue("$name", username);
        cmd.Parameters.AddWithValue("$pwd", pwd);
        using var reader = cmd.ExecuteReader();
        if (reader.Read())
        {
            userid = reader.GetString(0);
            usertype = reader.GetString(1);
            return true;
        }
        return false;
    }

    // ===== 新建试验（初始插入）=====
    public void InsertTest(string productId, string testId, string operatorId,
                           double preweight, double ambtemp, double ambhumi)
    {
        using var conn = new SqliteConnection(_connStr);
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO testmaster
                (productid, testid, testdate, operator, ambtemp, ambhumi,
                 according, apparatusid, apparatusname, apparatuschkdate, rptno,
                 preweight, postweight, lostweight, lostweight_per,
                 totaltesttime, constpower, phenocode, flametime, flameduration,
                 maxtf1,maxtf2,maxts,maxtc,
                 maxtf1_time,maxtf2_time,maxts_time,maxtc_time,
                 finaltf1,finaltf2,finalts,finaltc,
                 finaltf1_time,finaltf2_time,finalts_time,finaltc_time,
                 deltatf1,deltatf2,deltatf,deltats,deltatc)
            VALUES
                ($pid,$tid,date('now'),$op,$ambtemp,$ambhumi,
                 'ISO 11820:2022','FURNACE-01','一号试验炉',date('now'),$rptno,
                 $prewt,0,0,0,
                 0,0,'',0,0,
                 0,0,0,0,0,0,0,0,
                 0,0,0,0,0,0,0,0,
                 0,0,0,0,0)";
        cmd.Parameters.AddWithValue("$pid",    productId);
        cmd.Parameters.AddWithValue("$tid",    testId);
        cmd.Parameters.AddWithValue("$op",     operatorId);
        cmd.Parameters.AddWithValue("$ambtemp",ambtemp);
        cmd.Parameters.AddWithValue("$ambhumi",ambhumi);
        cmd.Parameters.AddWithValue("$rptno",  productId);
        cmd.Parameters.AddWithValue("$prewt",  preweight);
        cmd.ExecuteNonQuery();
    }

    // ===== 试验完成后更新统计字段 =====
    public void UpdateTestResult(string productId, string testId, double preweight,
                                 double postweight, double lostPer,
                                 double deltaTf, int totalTime, string phenocode)
    {
        using var conn = new SqliteConnection(_connStr);
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            UPDATE testmaster SET
                postweight      = $post,
                lostweight      = $lost,
                lostweight_per  = $lostper,
                deltatf         = $dtf,
                totaltesttime   = $time,
                phenocode       = $pheno,
                flag            = '10000000'
            WHERE productid=$pid AND testid=$tid";
        cmd.Parameters.AddWithValue("$post",   postweight);
        cmd.Parameters.AddWithValue("$lost",   preweight - postweight);
        cmd.Parameters.AddWithValue("$lostper",lostPer);
        cmd.Parameters.AddWithValue("$dtf",    deltaTf);
        cmd.Parameters.AddWithValue("$time",   totalTime);
        cmd.Parameters.AddWithValue("$pheno",  phenocode);
        cmd.Parameters.AddWithValue("$pid",    productId);
        cmd.Parameters.AddWithValue("$tid",    testId);
        cmd.ExecuteNonQuery();
    }

    // ===== 查询试验历史列表 =====
    public List<(string TestId, string ProductId, DateTime Date, string Op)>
        QueryTests(DateTime from, DateTime to, string productId = "")
    {
        var result = new List<(string, string, DateTime, string)>();
        using var conn = new SqliteConnection(_connStr);
        conn.Open();
        var cmd = conn.CreateCommand();
        cmd.CommandText = @"
            SELECT testid, productid, testdate, operator FROM testmaster
            WHERE testdate BETWEEN $from AND $to
              AND ($pid = '' OR productid LIKE '%' || $pid || '%')
            ORDER BY testdate DESC";
        cmd.Parameters.AddWithValue("$from", from.ToString("yyyy-MM-dd"));
        cmd.Parameters.AddWithValue("$to",   to.ToString("yyyy-MM-dd"));
        cmd.Parameters.AddWithValue("$pid",  productId);
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
            result.Add((reader.GetString(0), reader.GetString(1),
                        DateTime.Parse(reader.GetString(2)), reader.GetString(3)));
        return result;
    }
}
```
