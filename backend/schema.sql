-- ============================================================
-- schema.sql รขโฌโ€ Belton IPQC Database
-- This schema has been fully corrected and EXPANDED to explicitly 
-- support all measurement dimensions as columns, eliminating
-- reliance solely on JSON fields.
-- ============================================================

-- =============================================================
-- ปิดการล้าง DB เพื่อให้ข้อมูลยังคงอยู่เมื่อ Server รีสตาร์ท
-- หากต้องการรีเซ็ต ให้ลบฐานข้อมูลด้วยตัวเองใน MySQL
-- =============================================================
-- DROP DATABASE IF EXISTS belton_ipqc;
CREATE DATABASE IF NOT EXISTS belton_ipqc CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE belton_ipqc;

-- ==============================================================================
-- 1. (REMOVED) SPC CONFIG LIMITS
-- spc_config_limits has been replaced by per-module config tables:
-- dispensing_config, pof_config, damper_config, laser_config
-- ==============================================================================

-- ==============================================================================
-- 2. DISPENSING MODULE
-- ==============================================================================

-- Dispensing config (SPC limits per product / process_mode / dimension)
-- Matches server.js: GET/POST /api/config/dispensing, /api/config/dispensing/batch
CREATE TABLE IF NOT EXISTS dispensing_config (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    process_mode   VARCHAR(50),
    product_key    VARCHAR(100),
    dimension_name VARCHAR(100),
    lsl            DECIMAL(10,4),
    lcl            DECIMAL(10,4),
    cl             DECIMAL(10,4),
    ucl            DECIMAL(10,4),
    usl            DECIMAL(10,4),
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_dispensing_config (process_mode, product_key, dimension_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dispensing_records (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    product      VARCHAR(100),
    fixture      VARCHAR(50),
    test_date    DATE,
    buytime      VARCHAR(20),
    mctime       VARCHAR(20),
    team         VARCHAR(50),
    op           VARCHAR(50),
    data_type    VARCHAR(50),
    status       VARCHAR(20) DEFAULT 'ACCEPT',
    config_id    INT,
    
    -- Specific Dispensing Dimensions --
    x1 DECIMAL(10,4),
    y1 DECIMAL(10,4),
    x2 DECIMAL(10,4),
    y2 DECIMAL(10,4),
    x3 DECIMAL(10,4),
    y3 DECIMAL(10,4),
    x4 DECIMAL(10,4),
    y4 DECIMAL(10,4),
    x1_center DECIMAL(10,4),
    coil_position_1 DECIMAL(10,4),
    coil_position_2 DECIMAL(10,4),
    coil_position_1_s DECIMAL(10,4),
    coil_position_2_l DECIMAL(10,4),
    epoxy_length_1 DECIMAL(10,4),
    epoxy_length_2 DECIMAL(10,4),
    epoxy_length_1_s DECIMAL(10,4),
    epoxy_length_2_l DECIMAL(10,4),
    epoxy_length_1_l DECIMAL(10,4),
    epoxy_length_2_s DECIMAL(10,4),
    crash_stop_profile_1 DECIMAL(10,4),
    crash_stop_profile_2 DECIMAL(10,4),
    crash_stop_profile_3 DECIMAL(10,4),
    crash_stop_profile_1_l DECIMAL(10,4),
    crash_stop_profile_2_s DECIMAL(10,4),
    coil_outer_profile_u DECIMAL(10,4),
    coil_outer_profile_v DECIMAL(10,4),
    coil_outer_profile_w DECIMAL(10,4),
    coil_inner_profile_1 DECIMAL(10,4),
    coil_inner_profile_2 DECIMAL(10,4),
    coil_inner_profile_u DECIMAL(10,4),
    coil_inner_profile_v DECIMAL(10,4),
    coil_inner_profile_w DECIMAL(10,4),
    coil_inner_profile_uv DECIMAL(10,4),
    coil_symmetry DECIMAL(10,4),
    fantail_profile_1 DECIMAL(10,4),
    fantail_profile_2 DECIMAL(10,4),
    fantail_profile_3 DECIMAL(10,4),
    fantail_profile_4 DECIMAL(10,4),
    fantail_profile_5 DECIMAL(10,4),
    bobbin_position_1 DECIMAL(10,4),
    bobbin_position_2 DECIMAL(10,4),
    bobbin_hole_true DECIMAL(10,4),
    bobbin_slote_true DECIMAL(10,4),
    coil_parallel DECIMAL(10,4),
    coil_recess_dtm DECIMAL(10,4),
    coil_recess_ndtm DECIMAL(10,4),
    bobbin_parallel DECIMAL(10,4),
    bobbin_recess_dtm DECIMAL(10,4),
    bobbin_recess_ndtm DECIMAL(10,4),
    
    values_json  JSON,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alert_recipients (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    email   VARCHAR(255) UNIQUE,
    name    VARCHAR(255),
    role    VARCHAR(100),
    active  BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- 3. LASER ENGRAVING MODULE
-- ==============================================================================

-- NOTE: laser_config stores per-product inspection FREQUENCY (eblock_qty / bobbin_qty),
-- used by server.js (/api/laser_config, dashboard summary) and the Laser panel's
-- "Frequency" field in system_config.html (gc-laser-freq). This is a different concept
-- from the SPC lsl/lcl/cl/ucl/usl tables (dispensing_config / pof_config / damper_config).
-- A previous edit had redefined this table with the wrong (SPC-style) columns plus a
-- DROP TABLE IF EXISTS, which wiped saved frequency data on every schema re-run and
-- caused "Unknown column 'eblock_qty' in field list" because the seed INSERT below no
-- longer matched the table's actual columns. Fixed to match what server.js expects.
CREATE TABLE IF NOT EXISTS laser_config (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    product_key    VARCHAR(100) NOT NULL,
    eblock_qty     INT DEFAULT NULL,
    bobbin_qty     INT DEFAULT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_laser_config_product (product_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default laser config
INSERT IGNORE INTO laser_config (product_key, eblock_qty, bobbin_qty) VALUES ('DEFAULT', 1, 1);

CREATE TABLE IF NOT EXISTS laser_records (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    record_id      INT,
    config_id      INT,
    mode           VARCHAR(50),
    product_type   VARCHAR(50),
    product        VARCHAR(100),
    product_label  VARCHAR(100),
    partno         VARCHAR(50),
    qty            VARCHAR(50),
    machine        VARCHAR(50),
    test_date      DATE,
    en             VARCHAR(50),
    sendtime       VARCHAR(20),
    recvtime       VARCHAR(20),
    fixture        VARCHAR(50),
    ptno           VARCHAR(50),
    attr           VARCHAR(50),
    remark         TEXT,
    source         VARCHAR(50),
    ts             DATETIME,
    draft_index    INT,
    overall        VARCHAR(20),
    vmi            VARCHAR(20),
    
    -- Specific Laser Dimensions --
    lf_skip VARCHAR(50),
    lf_incomplete VARCHAR(50),
    lf_width DECIMAL(10,4),
    lf_length DECIMAL(10,4),
    lf_position DECIMAL(10,4),
    sf_skip VARCHAR(50),
    sf_incomplete VARCHAR(50),
    sf_width DECIMAL(10,4),
    sf_length DECIMAL(10,4),
    sf_position DECIMAL(10,4),
    z1_skip VARCHAR(50),
    z1_incomplete VARCHAR(50),
    z1_width DECIMAL(10,4),
    z1_length DECIMAL(10,4),
    z1_position DECIMAL(10,4),
    z2_skip VARCHAR(50),
    z2_incomplete VARCHAR(50),
    z2_width DECIMAL(10,4),
    z2_length DECIMAL(10,4),
    z2_position DECIMAL(10,4),
    z3_skip VARCHAR(50),
    z3_incomplete VARCHAR(50),
    z3_width DECIMAL(10,4),
    z3_length DECIMAL(10,4),
    z3_position DECIMAL(10,4),
    z1_missing VARCHAR(50),
    z2_missing VARCHAR(50),

    defects_json   JSON,
    op             VARCHAR(50),
    data_type      VARCHAR(50),
    part_type      VARCHAR(50),
    category       VARCHAR(50),
    status         VARCHAR(50),
    values_json    JSON,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- 4. PUSH OUT FORCE (POF) MODULE
-- ==============================================================================

-- POF config (SPC limits / frequency per product, data_type, type_parameter)
-- Matches server.js: GET/POST /api/config/pof, /api/config/pof/batch
-- NOTE: previously had "DROP TABLE IF EXISTS pof_config;" here. Since autoSeedData()
-- in server.js re-runs schema.sql on EVERY server start, that DROP was wiping out
-- every saved POF product/parameter config on every restart, which is why products
-- and their spec limits kept "disappearing". Removed — CREATE TABLE IF NOT EXISTS
-- below is enough to make sure the table exists without ever touching existing data.
CREATE TABLE IF NOT EXISTS pof_config (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    process_mode   VARCHAR(50),
    product_key    VARCHAR(100),
    dimension_name VARCHAR(100),
    lsl            DECIMAL(10,4),
    lcl            DECIMAL(10,4),
    cl             DECIMAL(10,4),
    ucl            DECIMAL(10,4),
    usl            DECIMAL(10,4),
    locked         TINYINT(1) DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_pof_config (process_mode, product_key, dimension_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pof_records (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    record_no      INT,
    product        VARCHAR(100),
    fixture        VARCHAR(50),
    pt_number      VARCHAR(50),
    test_date      DATE,
    oven           VARCHAR(50),
    team           VARCHAR(50),
    op             VARCHAR(50),
    data_type      VARCHAR(50),
    category       VARCHAR(50),
    status         VARCHAR(50) DEFAULT 'waiting',
    config_id      INT,
    mode           VARCHAR(50),
    coil_type      VARCHAR(50),
    product_label  VARCHAR(100),
    unit           VARCHAR(20),
    overall        VARCHAR(50),
    spc_ucl        DECIMAL(10,4),
    spc_cl         DECIMAL(10,4),
    spc_lcl        DECIMAL(10,4),
    spc_trig       DECIMAL(10,4),
    spc_spec       DECIMAL(10,4),
    remark         TEXT,
    en             VARCHAR(50),
    traveler       VARCHAR(100),
    
    -- Specific POF Dimensions --
    long1          DECIMAL(10,4),
    short2         DECIMAL(10,4),
    avg_val        DECIMAL(10,4),
    max_val        DECIMAL(10,4),
    min_val        DECIMAL(10,4),
    range_val      DECIMAL(10,4),
    long_fantail_spec_pass VARCHAR(50),
    long_fantail_trigger_pass VARCHAR(50),
    short_fantail_spec_pass VARCHAR(50),
    short_fantail_trigger_pass VARCHAR(50),
    bobbin_spec_pass VARCHAR(50),
    bobbin_trigger_pass VARCHAR(50),
    eblock_long    DECIMAL(10,4),
    eblock_short   DECIMAL(10,4),
    eblock_avg     DECIMAL(10,4),
    coil_short     DECIMAL(10,4),
    coil_center    DECIMAL(10,4),
    coil_long      DECIMAL(10,4),
    bobbin_short   DECIMAL(10,4),
    bobbin_center  DECIMAL(10,4),
    bobbin_long    DECIMAL(10,4),

    spec_result    VARCHAR(50),
    trigger_val    VARCHAR(50),
    out_cl         VARCHAR(50),
    trend          VARCHAR(50),
    nine_pt        VARCHAR(50),
    saved_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    values_json    JSON,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- 5. DAMPER INSTALL MODULE
-- ==============================================================================

-- Damper config (SPC limits / frequency per product, process_mode, data_type, damper_type)
-- Matches server.js: GET/POST /api/config/damper, /api/config/damper/batch
-- NOTE: same issue as pof_config above — "DROP TABLE IF EXISTS damper_config;" was
-- wiping saved Damper config every time the server restarted. Removed.
CREATE TABLE IF NOT EXISTS damper_config (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    process_mode   VARCHAR(50),
    product_key    VARCHAR(100),
    dimension_name VARCHAR(100),
    lsl            DECIMAL(10,4),
    lcl            DECIMAL(10,4),
    cl             DECIMAL(10,4),
    ucl            DECIMAL(10,4),
    usl            DECIMAL(10,4),
    locked         TINYINT(1) DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_damper_config (process_mode, product_key, dimension_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS damper_records (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    record_no      INT,
    config_id      INT,
    mode           VARCHAR(50),
    test_date      DATE,
    send_time      VARCHAR(20),
    recv_time      VARCHAR(20),
    attribute      VARCHAR(50),
    traveler       VARCHAR(100),
    qc_en          VARCHAR(50),
    me_en          VARCHAR(50),
    team           VARCHAR(50),
    vmi_results    JSON,
    vmi_pass       BOOLEAN,
    
    -- Specific Damper Dimensions --
    short_vals     VARCHAR(255),
    short_avg      DECIMAL(10,4),
    short_max      DECIMAL(10,4),
    short_min      DECIMAL(10,4),
    short_in_spec  BOOLEAN,
    long_vals      VARCHAR(255),
    long_avg       DECIMAL(10,4),
    long_max       DECIMAL(10,4),
    long_min       DECIMAL(10,4),
    long_in_spec   BOOLEAN,
    vmi_disposition VARCHAR(255),
    buy_off_damper_position VARCHAR(255),
    
    overall_pass   BOOLEAN,
    saved_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    product        VARCHAR(100),
    fixture        VARCHAR(50),
    pt_number      VARCHAR(50),
    op             VARCHAR(50),
    data_type      VARCHAR(50),
    category       VARCHAR(50),
    status         VARCHAR(50) DEFAULT 'waiting',
    values_json    JSON,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- 6. SYSTEM CONFIG AND ALERT MASTERS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS system_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    process_type VARCHAR(50),
    config_key VARCHAR(100),
    config_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_config_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS system_alert (
    id INT AUTO_INCREMENT PRIMARY KEY,
    process_type VARCHAR(50),
    record_id INT,
    alert_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    level VARCHAR(50),
    product VARCHAR(100),
    fixture VARCHAR(50),
    oven VARCHAR(50),
    traveler VARCHAR(100),
    param VARCHAR(100),
    value_val DECIMAL(10,4),
    spec_str VARCHAR(255),
    msg TEXT,
    details JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- 7. PRODUCT TABLES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS master_products (
    product_key VARCHAR(100) PRIMARY KEY,
    product_name VARCHAR(100),
    dims JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dispensing_product (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    mode VARCHAR(50),
    product_key  VARCHAR(100),
    UNIQUE KEY (product_name, mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS laser_product (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    mode         VARCHAR(50),
    UNIQUE KEY (product_name, mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pof_product (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    mode         VARCHAR(50),
    UNIQUE KEY (product_name, mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS damper_product (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    mode         VARCHAR(50),
    UNIQUE KEY (product_name, mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- 8. INITIAL DATA: PRODUCT SEEDING
-- ==============================================================================

-- MASTER PRODUCTS
INSERT IGNORE INTO master_products (product_key, product_name, dims) VALUES
('Cimarron BP 3D Inch', 'CimarronBP 3D', '["Coil_outer_profile_u", "Coil_outer_profile_v", "Coil_outer_profile_w", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('Cimarron BP 4D Inch', 'CimarronBP 4D', '["Coil_outer_profile_u", "Coil_outer_profile_v", "Coil_outer_profile_w", "X1", "Y1", "Bobbin_position_1", "X2", "Y2", "Bobbin_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_parallel","n":7}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('Cimarron BP 5D Inch', 'CimarronBP 5D', '["Coil_outer_profile_u", "Coil_outer_profile_v", "Coil_outer_profile_w", "X1", "Y1", "Bobbin_position_1", "X2", "Y2", "Bobbin_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_parallel","n":7}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('Dorado 5D Inch', 'Dorado 5D', '["X1", "Y1", "Coil_position_1_S", "X2", "Y2", "Coil_position_2_L", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1_L", "Crash_stop_profile_2_S", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('Dorado 10D AL BB', 'Dorado 5D AL BB', '["X1", "Y1", "Coil_position_1_S", "X2", "Y2", "Coil_position_2_L", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1_L", "Crash_stop_profile_2_S", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('Dorado 10D NOAR', 'Dorado 10D', '["X1_Center", "X1", "Y1", "Coil_position_1_S", "X2", "Y2", "Coil_position_2_L", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1_L", "Crash_stop_profile_2_S", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('Dorado 10D NOAR-AAD', 'Dorado 10D NOAR-AAD', '["X1_Center", "X1", "Y1", "Coil_position_1_S", "X2", "Y2", "Coil_position_2_L", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1_L", "Crash_stop_profile_2_S", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('M11 P MM', 'M11 P', '["Epoxy_length_1_L", "Epoxy_length_2_S", "Fantail_profile_1", "Fantail_profile_2", "Fantail_profile_3", "Fantail_profile_4", "Fantail_profile_5", {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('ComET MM', 'ComET', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('Marlin 10D AL BB', 'Marlin 10D', '["X1_Center", "X1", "Y1", "Coil_position_1_S", "X2", "Y2", "Coil_position_2_L", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1_L", "Crash_stop_profile_2_S", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('Rosewood 1D MM', 'Rosewood 1D', '["Coil_inner_profile_1", "Coil_inner_profile_u", "Coil_inner_profile_v", "Coil_inner_profile_w", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", "Crash_stop_profile_3", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('Rosewood 2D MM', 'Rosewood 2D', '["Coil_inner_profile_1", "Coil_inner_profile_2", "Coil_inner_profile_UV", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", "Crash_stop_profile_3", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('Skybolt 1D MM', 'Skybolt 1D MM', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", "Coil_symmetry", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('Skybolt 2D MM', 'Skybolt 2D', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", "Coil_symmetry", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('Skybolt 3D MM', 'Skybolt 3D', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", "Coil_symmetry", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('Skybolt 4D MM', 'Skybolt 4D', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", "Coil_symmetry", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('Summit 10D Inch', 'Summit 10D', '["X1", "Y1", "Bobbin_hole_true", "X2", "Y2", "Bobbin_slote_true", "X3", "Y3", "Coil_position_1", "X4", "Y4", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_parallel","n":7}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('V11 1D Inch', 'V11 1D', '["Coil_position_1", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('V11 2D Inch', 'V11 2D', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('V11 4D Inch', 'V11 4D', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('V15 Cimarron 4D Inch', 'V15 CMR 4D', '["X1", "Y1", "X2", "Y2", "Coil_position_1", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]');

-- DISPENSING PRODUCTS
INSERT IGNORE INTO dispensing_product (product_name, mode) VALUES
('Cimarron BP 3D Inch', 'Buy-off'), ('Cimarron BP 4D Inch', 'Buy-off'), ('Cimarron BP 5D Inch', 'Buy-off'),
('ComET MM', 'Buy-off'), ('Dorado 5D Inch', 'Buy-off'), ('Dorado 10D AL BB', 'Buy-off'),
('Dorado 10D NOAR', 'Buy-off'), ('Dorado 10D NOAR-AAD', 'Buy-off'), ('M11 P MM', 'Buy-off'),
('Marlin 10D AL BB', 'Buy-off'), ('Rosewood 1D MM', 'Buy-off'), ('Rosewood 2D MM', 'Buy-off'),
('Skybolt 1D MM', 'Buy-off'), ('Skybolt 2D MM', 'Buy-off'), ('Skybolt 3D MM', 'Buy-off'),
('Skybolt 4D MM', 'Buy-off'), ('Summit 10D Inch', 'Buy-off'), ('V11 1D Inch', 'Buy-off'),
('V11 2D Inch', 'Buy-off'), ('V11 4D Inch', 'Buy-off'), ('V15 Cimarron 4D Inch', 'Buy-off'),
('Cimarron BP 3D Inch', 'Roving'), ('Cimarron BP 4D Inch', 'Roving'), ('Cimarron BP 5D Inch', 'Roving'),
('ComET MM', 'Roving'), ('Dorado 10D AL BB', 'Roving'), ('Dorado 10D NOAR', 'Roving'),
('M11 P MM', 'Roving'), ('Marlin 10D AL BB', 'Roving'), ('Rosewood 1D MM', 'Roving'),
('Rosewood 2D MM', 'Roving'), ('Skybolt 1D MM', 'Roving'), ('Skybolt 2D MM', 'Roving'),
('Skybolt 3D MM', 'Roving'), ('Skybolt 4D MM', 'Roving'), ('Summit 10D Inch', 'Roving'),
('V11 1D Inch', 'Roving'), ('V11 2D Inch', 'Roving'), ('V11 4D Inch', 'Roving'),
('V15 Cimarron 4D Inch', 'Roving');

-- LASER PRODUCTS
INSERT IGNORE INTO laser_product (product_name, mode) VALUES
('Bobbin Dorado 5D AL BB', 'Buy-off'), ('Dorado 5D AL BB', 'Buy-off'), ('Bobbin Marlin 10D', 'Buy-off'),
('Cimarron BP 3D', 'Buy-off'), ('Cimarron BP 4D', 'Buy-off'), ('Cimarron BP 5D', 'Buy-off'),
('ComET', 'Buy-off'), ('Dorado 5D AL BB', 'Buy-off'), ('Dorado 5D', 'Buy-off'),
('Dorado 10D NOAR', 'Buy-off'), ('M11 P', 'Buy-off'), ('Marlin 10D', 'Buy-off'),
('Rosewood 1D', 'Buy-off'), ('Rosewood 2D', 'Buy-off'), ('Skybolt 1D', 'Buy-off'),
('Skybolt 2D', 'Buy-off'), ('Skybolt 3D', 'Buy-off'), ('Skybolt 4D', 'Buy-off'),
('Summit 10D', 'Buy-off'), ('V11 1D', 'Buy-off'), ('V11 2D', 'Buy-off'),
('V11 4D', 'Buy-off'), ('V15 Cimarron 4D', 'Buy-off'),
('Bobbin Dorado 5D AL BB', 'Roving'), ('Bobbin Marlin 10D', 'Roving'), ('Cimarron BP 3D', 'Roving'),
('Cimarron BP 4D', 'Roving'), ('Cimarron BP 5D', 'Roving'), ('ComET', 'Roving'),
('Dorado 5D ALBB', 'Roving'), ('Dorado 5D', 'Roving'), ('Dorado 10D NOAR', 'Roving'),
('M11 P', 'Roving'), ('Marlin 10D', 'Roving'), ('Rosewood 1D', 'Roving'),
('Rosewood 2D', 'Roving'), ('Skybolt 1D', 'Roving'), ('Skybolt 2D', 'Roving'),
('Skybolt 3D', 'Roving'), ('Skybolt 4D', 'Roving'), ('Summit 10D', 'Roving'),
('V11 1D', 'Roving'), ('V11 2D', 'Roving'), ('V11 4D', 'Roving'), ('V15 Cimarron 4D', 'Roving');

-- POF PRODUCTS
INSERT IGNORE INTO pof_product (product_name, mode) VALUES
('Cimarron BP 3D', 'Buy-off'), ('Cimarron BP 4D', 'Buy-off'), ('Cimarron BP 5D', 'Buy-off'),
('ComET', 'Buy-off'), ('ComET', 'Buy-off'), ('Dorado 5D', 'Buy-off'),
('Dorado 10D NOAR', 'Buy-off'), ('M11 P', 'Buy-off'), ('Marlin 10D', 'Buy-off'),
('Rosewood 1D', 'Buy-off'), ('Rosewood 2D', 'Buy-off'), ('Skybolt 1D', 'Buy-off'),
('Skybolt 2D', 'Buy-off'), ('Skybolt 3D', 'Buy-off'), ('Skybolt 4D', 'Buy-off'),
('Summit 10D', 'Buy-off'), ('V11 1D', 'Buy-off'), ('V11 2D', 'Buy-off'),
('V11 4D', 'Buy-off'), ('V15 Cimarron 4D', 'Buy-off'),
('Cimarron BP 3D', 'Roving'), ('Cimarron BP 4D', 'Roving'), ('Cimarrron BP 5D', 'Roving'),
('ComET', 'Roving'), ('Dorado 10D', 'Roving'), ('M11 P', 'Roving'),
('Marlin 10D', 'Roving'), ('Rosewood 1D', 'Roving'), ('Rosewood 2D', 'Roving'),
('Skybolt 1D', 'Roving'), ('Skybolt 2D', 'Roving'), ('Skybolt 3D', 'Roving'),
('Skybolt 4D', 'Roving'), ('Summit 10D', 'Roving'), ('V11 1D', 'Roving'),
('V11 2D', 'Roving'), ('V11 4D', 'Roving'), ('V15 Cimarron 4D', 'Roving'),
('Cimarron BP 3D', 'OBA'), ('Cimarron BP 4D', 'OBA'), ('Cimarron BP 5D', 'OBA'),
('ComET', 'OBA'), ('Dorado 5D AL BB', 'OBA'), ('Dorado 5D NOAR', 'OBA'),
('Dorado 10D NOAR', 'OBA'), ('Dorado 10D NOAR-AAD', 'OBA'), ('M11 P', 'OBA'),
('Marlin 10D', 'OBA'), ('Rosewood 1D', 'OBA'), ('Rosewood 2D', 'OBA'),
('Skybolt 1D', 'OBA'), ('Skybolt 2D', 'OBA'), ('Skybolt 3D', 'OBA'),
('Skybolt 4D', 'OBA'), ('Summit 10D', 'OBA'), ('V11 1D', 'OBA'),
('V11 2D', 'OBA'), ('V11 4D', 'OBA'), ('V15 Cimarron 4D', 'OBA'),
('Cimarron BP 3D', 'Special'), ('Cimarron BP 4D', 'Special'), ('Cimarron BP 4D', 'Special'),
('Cimarron BP 5D Lbs', 'Special'), ('Dorado 5D AL BB Lbs', 'Special'), ('Dorado 10D NOAR', 'Special'),
('Marlin 10D', 'Special'), ('Marlin 10D ALL SBR', 'Special'), ('Rosewood 1D Kgf', 'Special'),
('Rosewood 1D Kgf', 'Special'), ('Rosewood 1D Kgf', 'Special'), ('Rosewood 1D SBR', 'Special'),
('Rosewood 2D', 'Special'), ('Rosewood 2D', 'Special'), ('Rosewood 2D', 'Special'),
('Rosewood 2D Kgr', 'Special'), ('Skybolt 3D SBR', 'Special'), ('Skybolt 4D', 'Special'),
('Summit 10D', 'Special'), ('Summit 10D SBR', 'Special'), ('V11 1D', 'Special'),
('V11 1D PE', 'Special'), ('V11 1D RE', 'Special'), ('V11 1D', 'Special'),
('V11 1D Lbs', 'Special'), ('V11 2D', 'Special'), ('V11 2D SBR', 'Special'),
('V15 Cimarron 4D SBR', 'Special'), ('V15 Cimarron 4D Lbs', 'Special');

-- DAMPER PRODUCTS
INSERT IGNORE INTO damper_product (product_name, mode) VALUES
('Cimarron BP 3D Semi', 'Buy-off'), ('Cimarron BP 3D A&B', 'Buy-off'), ('Cimarron BP 3D', 'Buy-off'),
('Cimarron BP 4D A&B', 'Buy-off'), ('Cimarron BP 4D Semi', 'Buy-off'), ('Cimarron BP 4D', 'Buy-off'),
('Cimarron BP 5D Semi', 'Buy-off'), ('Cimarron BP 5D A&B', 'Buy-off'), ('Dorado 5D', 'Buy-off'),
('Dorado 5D AL BB', 'Buy-off'), ('Dorado 5D NOAR', 'Buy-off'), ('Dorado 10D', 'Buy-off'),
('Dorado 10D NOAR', 'Buy-off'), ('Dorado 10D NOAR-AAD', 'Buy-off'), ('Marlin 10D Semi', 'Buy-off'),
('Skybolt 1D', 'Buy-off'), ('Skybolt 2D', 'Buy-off'), ('Skybolt 3D', 'Buy-off'),
('Skybolt 4D', 'Buy-off'), ('Summit 10D', 'Buy-off'), ('V11 4D', 'Buy-off'),
('V15 Cimarron 4D A&B', 'Buy-off'),
('Cimarron BP 3D', 'Roving'), ('Cimarron BP 4D', 'Roving'), ('Cimarron BP 5D', 'Roving'),
('Dorado 5D AL BB', 'Roving'), ('Dorado 5D ', 'Roving'), ('Dorado 10D NOAR', 'Roving'),
('Marlin 10D', 'Roving'), ('Skybolt 1D', 'Roving'), ('Skybolt 2D', 'Roving'),
('Skybolt 3D', 'Roving'), ('Skybolt 4D', 'Roving'), ('Summit 10D', 'Roving'),
('V11 4D', 'Roving'), ('V15 Cimarron 4D', 'Roving');

USE belton_ipqc;
-- =========================================================================
-- INITIAL DATA: DISPENSING CONFIG
-- (Moved out of spc_config_limits — dispensing now has its own config table)
-- =========================================================================
INSERT IGNORE INTO dispensing_config (process_mode, product_key, dimension_name, lsl, lcl, cl, ucl, usl) VALUES
-- ==========================================
-- MODE: BUYOFF
-- ==========================================
-- cmr3d
('buyoff', 'Cimarron BP 3D Inch', 'Coil_outer_profile_u', 0.9500, NULL, 0.9570, NULL, 0.9650),
('buyoff', 'Cimarron BP 3D Inch', 'Coil_outer_profile_v', 0.9500, NULL, 0.9570, NULL, 0.9650),
('buyoff', 'Cimarron BP 3D Inch', 'Coil_outer_profile_w', 0.9500, NULL, 0.9570, NULL, 0.9650),
('buyoff', 'Cimarron BP 3D Inch', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'Cimarron BP 3D Inch', 'Epoxy_length_2', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'Cimarron BP 3D Inch', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('buyoff', 'Cimarron BP 3D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'Cimarron BP 3D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Cimarron BP 3D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- cmr4d
('buyoff', 'Cimarron BP 4D Inch', 'X1', 0.5625, NULL, 0.5700, NULL, 0.5775),
('buyoff', 'Cimarron BP 4D Inch', 'Y1', -0.0075, NULL, 0.0000, NULL, 0.0075),
('buyoff', 'Cimarron BP 4D Inch', 'X2', 0.9125, NULL, 0.9200, NULL, 0.9275),
('buyoff', 'Cimarron BP 4D Inch', 'Y2', -0.0075, NULL, 0.0000, NULL, 0.0075),
('buyoff', 'Cimarron BP 4D Inch', 'Coil_outer_profile_u', 1.1725, NULL, 1.1820, NULL, 1.1915),
('buyoff', 'Cimarron BP 4D Inch', 'Coil_outer_profile_v', 1.1725, NULL, 1.1820, NULL, 1.1915),
('buyoff', 'Cimarron BP 4D Inch', 'Coil_outer_profile_w', 1.1725, NULL, 1.1820, NULL, 1.1915),
('buyoff', 'Cimarron BP 4D Inch', 'Bobbin_position_1', 0.0000, NULL, NULL, NULL, 0.0150),
('buyoff', 'Cimarron BP 4D Inch', 'Bobbin_position_2', 0.0000, NULL, NULL, NULL, 0.0150),
('buyoff', 'Cimarron BP 4D Inch', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'Cimarron BP 4D Inch', 'Epoxy_length_2', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'Cimarron BP 4D Inch', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('buyoff', 'Cimarron BP 4D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'Cimarron BP 4D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Cimarron BP 4D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Cimarron BP 4D Inch', 'Bobbin_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'Cimarron BP 4D Inch', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Cimarron BP 4D Inch', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- cmr5d
('buyoff', 'Cimarron BP 5D Inch', 'X1', 0.5625, NULL, 0.5700, NULL, 0.5775),
('buyoff', 'Cimarron BP 5D Inch', 'Y1', -0.0075, NULL, 0.0000, NULL, 0.0075),
('buyoff', 'Cimarron BP 5D Inch', 'X2', 0.9125, NULL, 0.9200, NULL, 0.9275),
('buyoff', 'Cimarron BP 5D Inch', 'Y2', -0.0075, NULL, 0.0000, NULL, 0.0075),
('buyoff', 'Cimarron BP 5D Inch', 'Coil_outer_profile_u', 1.1925, NULL, 1.2020, NULL, 1.2115),
('buyoff', 'Cimarron BP 5D Inch', 'Coil_outer_profile_v', 1.1925, NULL, 1.2020, NULL, 1.2115),
('buyoff', 'Cimarron BP 5D Inch', 'Coil_outer_profile_w', 1.1925, NULL, 1.2020, NULL, 1.2115),
('buyoff', 'Cimarron BP 5D Inch', 'Bobbin_position_1', 0.0000, NULL, NULL, NULL, 0.0150),
('buyoff', 'Cimarron BP 5D Inch', 'Bobbin_position_2', 0.0000, NULL, NULL, NULL, 0.0150),
('buyoff', 'Cimarron BP 5D Inch', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'Cimarron BP 5D Inch', 'Epoxy_length_2', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'Cimarron BP 5D Inch', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('buyoff', 'Cimarron BP 5D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'Cimarron BP 5D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Cimarron BP 5D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Cimarron BP 5D Inch', 'Bobbin_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'Cimarron BP 5D Inch', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Cimarron BP 5D Inch', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- comet
('buyoff', 'ComET MM', 'X1', 20.9562, NULL, 21.0340, NULL, 21.2118),
('buyoff', 'ComET MM', 'Y1', 7.3832, NULL, 7.5610, NULL, 7.7388),
('buyoff', 'ComET MM', 'X2', 20.9562, NULL, 21.0340, NULL, 21.2118),
('buyoff', 'ComET MM', 'Y2', 7.3832, NULL, 7.5610, NULL, 7.7388),
('buyoff', 'ComET MM', 'Coil_position_1', 0.0000, NULL, NULL, 0.2845, 0.3556),
('buyoff', 'ComET MM', 'Coil_position_2', 0.0000, NULL, NULL, 0.2845, 0.3556),
('buyoff', 'ComET MM', 'Epoxy_length_1', -1.2700, NULL, 0.0000, NULL, 1.2700),
('buyoff', 'ComET MM', 'Epoxy_length_2', -1.2700, NULL, 0.0000, NULL, 1.2700),
('buyoff', 'ComET MM', 'Crash_stop_profile_1', -0.0600, -0.0300, 0.0000, 0.0300, 0.0600),
('buyoff', 'ComET MM', 'Coil_parallel', NULL, NULL, NULL, NULL, 0.1520),
('buyoff', 'ComET MM', 'Coil_recess_DTM', NULL, NULL, NULL, NULL, 0.2500),
('buyoff', 'ComET MM', 'Coil_recess_NDTM', NULL, NULL, NULL, NULL, 0.2500),

-- dorado5d
('buyoff', 'Dorado 5D Inch', 'X1', 0.7640, 0.7650, 0.7690, 0.7730, 0.7740),
('buyoff', 'Dorado 5D Inch', 'Y1', 0.2270, 0.2280, 0.2320, 0.2360, 0.2370),
('buyoff', 'Dorado 5D Inch', 'X2', 0.7640, 0.7650, 0.7690, 0.7730, 0.7740),
('buyoff', 'Dorado 5D Inch', 'Y2', 0.2270, 0.2280, 0.2320, 0.2360, 0.2370),
('buyoff', 'Dorado 5D Inch', 'Coil_position_1_S', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('buyoff', 'Dorado 5D Inch', 'Coil_position_2_L', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('buyoff', 'Dorado 5D Inch', 'Epoxy_length_1_S', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'Dorado 5D Inch', 'Epoxy_length_2_L', 0.9000, NULL, NULL, NULL, 0.9750),
('buyoff', 'Dorado 5D Inch', 'Crash_stop_profile_1_L', 0.3775, 0.3780, 0.3800, 0.3820, 0.3825),
('buyoff', 'Dorado 5D Inch', 'Crash_stop_profile_2_S', -0.0025, -0.0020, 0.0000, 0.0020, 0.0025),
('buyoff', 'Dorado 5D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'Dorado 5D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Dorado 5D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Dorado 5D Inch', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Dorado 5D Inch', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- dorado10d al bb
('buyoff', 'Dorado 10D AL BB', 'X1_Center', 0.6140, 0.6150, 0.6200, 0.6250, 0.6260),
('buyoff', 'Dorado 10D AL BB', 'X1', 0.8780, 0.8790, 0.8830, 0.8870, 0.8880),
('buyoff', 'Dorado 10D AL BB', 'Y1', 0.2690, 0.2700, 0.2740, 0.2780, 0.2790),
('buyoff', 'Dorado 10D AL BB', 'X2', 0.8780, 0.8790, 0.8830, 0.8870, 0.8880),
('buyoff', 'Dorado 10D AL BB', 'Y2', 0.2690, 0.2700, 0.2740, 0.2780, 0.2790),
('buyoff', 'Dorado 10D AL BB', 'Coil_position_1_S', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('buyoff', 'Dorado 10D AL BB', 'Coil_position_2_L', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('buyoff', 'Dorado 10D AL BB', 'Epoxy_length_1_S', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'Dorado 10D AL BB', 'Epoxy_length_2_L', 0.9500, NULL, 0.9950, NULL, 1.0700),
('buyoff', 'Dorado 10D AL BB', 'Crash_stop_profile_1_L', 0.3775, 0.3780, 0.3800, 0.3820, 0.3825),
('buyoff', 'Dorado 10D AL BB', 'Crash_stop_profile_2_S', -0.0025, -0.0020, 0.0000, 0.0020, 0.0025),
('buyoff', 'Dorado 10D AL BB', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'Dorado 10D AL BB', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Dorado 10D AL BB', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Dorado 10D AL BB', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Dorado 10D AL BB', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- dorado10d noar
('buyoff', 'Dorado 10D NOAR', 'X1_Center', 0.6140, 0.6150, 0.6200, 0.6250, 0.6260),
('buyoff', 'Dorado 10D NOAR', 'X1', 0.8780, 0.8790, 0.8830, 0.8870, 0.8880),
('buyoff', 'Dorado 10D NOAR', 'Y1', 0.2690, 0.2700, 0.2740, 0.2780, 0.2790),
('buyoff', 'Dorado 10D NOAR', 'X2', 0.8780, 0.8790, 0.8830, 0.8870, 0.8880),
('buyoff', 'Dorado 10D NOAR', 'Y2', 0.2690, 0.2700, 0.2740, 0.2780, 0.2790),
('buyoff', 'Dorado 10D NOAR', 'Coil_position_1_S', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('buyoff', 'Dorado 10D NOAR', 'Coil_position_2_L', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('buyoff', 'Dorado 10D NOAR', 'Epoxy_length_1_S', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'Dorado 10D NOAR', 'Epoxy_length_2_L', 0.9500, NULL, 0.9950, NULL, 1.0700),
('buyoff', 'Dorado 10D NOAR', 'Crash_stop_profile_1_L', 0.3775, 0.3780, 0.3800, 0.3820, 0.3825),
('buyoff', 'Dorado 10D NOAR', 'Crash_stop_profile_2_S', -0.0025, -0.0020, 0.0000, 0.0020, 0.0025),
('buyoff', 'Dorado 10D NOAR', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'Dorado 10D NOAR', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Dorado 10D NOAR', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Dorado 10D NOAR', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Dorado 10D NOAR', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- dorado10d noar aad
('buyoff', 'Dorado 10D NOAR-AAD', 'X1_Center', 0.6140, 0.6150, 0.6200, 0.6250, 0.6260),
('buyoff', 'Dorado 10D NOAR-AAD', 'X1', 0.8780, 0.8790, 0.8830, 0.8870, 0.8880),
('buyoff', 'Dorado 10D NOAR-AAD', 'Y1', 0.2690, 0.2700, 0.2740, 0.2780, 0.2790),
('buyoff', 'Dorado 10D NOAR-AAD', 'X2', 0.8780, 0.8790, 0.8830, 0.8870, 0.8880),
('buyoff', 'Dorado 10D NOAR-AAD', 'Y2', 0.2690, 0.2700, 0.2740, 0.2780, 0.2790),
('buyoff', 'Dorado 10D NOAR-AAD', 'Coil_position_1_S', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('buyoff', 'Dorado 10D NOAR-AAD', 'Coil_position_2_L', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('buyoff', 'Dorado 10D NOAR-AAD', 'Epoxy_length_1_S', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'Dorado 10D NOAR-AAD', 'Epoxy_length_2_L', 0.9500, NULL, 0.9950, NULL, 1.0700),
('buyoff', 'Dorado 10D NOAR-AAD', 'Crash_stop_profile_1_L', 0.3775, 0.3780, 0.3800, 0.3820, 0.3825),
('buyoff', 'Dorado 10D NOAR-AAD', 'Crash_stop_profile_2_S', -0.0025, -0.0020, 0.0000, 0.0020, 0.0025),
('buyoff', 'Dorado 10D NOAR-AAD', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'Dorado 10D NOAR-AAD', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Dorado 10D NOAR-AAD', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Dorado 10D NOAR-AAD', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Dorado 10D NOAR-AAD', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- marlin10d
('buyoff', 'Marlin 10D AL BB', 'X1_Center', 0.6550, NULL, 0.6600, NULL, 0.6650),
('buyoff', 'Marlin 10D AL BB', 'X1', 0.9150, NULL, 0.9220, NULL, 0.9290),
('buyoff', 'Marlin 10D AL BB', 'Y1', 0.2740, NULL, 0.2810, NULL, 0.2880),
('buyoff', 'Marlin 10D AL BB', 'X2', 0.9150, NULL, 0.9220, NULL, 0.9290),
('buyoff', 'Marlin 10D AL BB', 'Y2', 0.2740, NULL, 0.2810, NULL, 0.2880),
('buyoff', 'Marlin 10D AL BB', 'Coil_position_1_S', 0.0000, NULL, NULL, NULL, 0.0140),
('buyoff', 'Marlin 10D AL BB', 'Coil_position_2_L', 0.0000, NULL, NULL, NULL, 0.0140),
('buyoff', 'Marlin 10D AL BB', 'Epoxy_length_1_S', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'Marlin 10D AL BB', 'Epoxy_length_2_L', 0.0300, NULL, NULL, NULL, 0.1000),
('buyoff', 'Marlin 10D AL BB', 'Crash_stop_profile_1_L', 0.1345, NULL, 0.1375, NULL, 0.1395),
('buyoff', 'Marlin 10D AL BB', 'Crash_stop_profile_2_S', -0.0025, NULL, 0.0000, NULL, 0.0025),
('buyoff', 'Marlin 10D AL BB', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'Marlin 10D AL BB', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Marlin 10D AL BB', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Marlin 10D AL BB', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Marlin 10D AL BB', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- m11
('buyoff', 'M11 P MM', 'Epoxy_length_1_L', 7.2100, NULL, NULL, NULL, 8.7100),
('buyoff', 'M11 P MM', 'Epoxy_length_2_S', 16.5000, NULL, NULL, NULL, 18.0000),
('buyoff', 'M11 P MM', 'Fantail_profile_1', 9.3300, NULL, NULL, NULL, 9.4300),
('buyoff', 'M11 P MM', 'Fantail_profile_2', 17.1000, NULL, NULL, NULL, 17.2000),
('buyoff', 'M11 P MM', 'Fantail_profile_3', 0.9600, NULL, NULL, NULL, 1.1200),
('buyoff', 'M11 P MM', 'Fantail_profile_4', 17.9200, NULL, NULL, NULL, 18.0800),
('buyoff', 'M11 P MM', 'Fantail_profile_5', 4.3100, NULL, NULL, NULL, 4.4100),
('buyoff', 'M11 P MM', 'Coil_recess_DTM', NULL, NULL, NULL, NULL, 0.3800),
('buyoff', 'M11 P MM', 'Coil_recess_NDTM', NULL, NULL, NULL, NULL, 0.3800),

-- rosewood1d
('buyoff', 'Rosewood 1D MM', 'Coil_inner_profile_1', 0.8900, NULL, 1.0700, NULL, 1.2500),
('buyoff', 'Rosewood 1D MM', 'Coil_inner_profile_u', 16.2200, NULL, 16.4000, NULL, 16.5800),
('buyoff', 'Rosewood 1D MM', 'Coil_inner_profile_v', 16.2200, NULL, 16.4000, NULL, 16.5800),
('buyoff', 'Rosewood 1D MM', 'Coil_inner_profile_w', 16.2200, NULL, 16.4000, NULL, 16.5800),
('buyoff', 'Rosewood 1D MM', 'Epoxy_length_1', 10.9760, NULL, 11.3560, NULL, 12.2560),
('buyoff', 'Rosewood 1D MM', 'Epoxy_length_2', 14.0730, NULL, 14.4530, NULL, 15.3530),
('buyoff', 'Rosewood 1D MM', 'Crash_stop_profile_1', 8.7090, NULL, 8.7710, NULL, 8.8340),
('buyoff', 'Rosewood 1D MM', 'Crash_stop_profile_2', 0.9540, NULL, 1.0160, NULL, 1.0790),
('buyoff', 'Rosewood 1D MM', 'Crash_stop_profile_3', 16.8930, NULL, 16.9550, NULL, 17.0180),
('buyoff', 'Rosewood 1D MM', 'Coil_parallel', NULL, NULL, 0.0000, NULL, 0.1200),
('buyoff', 'Rosewood 1D MM', 'Coil_recess_DTM', NULL, NULL, 0.0000, NULL, 0.2500),
('buyoff', 'Rosewood 1D MM', 'Coil_recess_NDTM', NULL, NULL, 0.0000, NULL, 0.2500),

-- rosewood2d
('buyoff', 'Rosewood 2D MM', 'Coil_inner_profile_1', -0.1600, NULL, 0.0200, NULL, 0.2000),
('buyoff', 'Rosewood 2D MM', 'Coil_inner_profile_2', -0.1600, NULL, 0.0200, NULL, 0.2000),
('buyoff', 'Rosewood 2D MM', 'Coil_inner_profile_UV', 15.7480, NULL, 15.9280, NULL, 16.1080),
('buyoff', 'Rosewood 2D MM', 'Epoxy_length_1', 12.5690, NULL, 12.9490, NULL, 13.6990),
('buyoff', 'Rosewood 2D MM', 'Epoxy_length_2', 14.1700, NULL, 14.5500, NULL, 15.3000),
('buyoff', 'Rosewood 2D MM', 'Crash_stop_profile_1', 8.7090, NULL, 8.7710, NULL, 8.8340),
('buyoff', 'Rosewood 2D MM', 'Crash_stop_profile_2', 0.9540, NULL, 1.0160, NULL, 1.0790),
('buyoff', 'Rosewood 2D MM', 'Crash_stop_profile_3', 12.1490, NULL, 12.2110, NULL, 12.2740),
('buyoff', 'Rosewood 2D MM', 'Coil_parallel', NULL, NULL, 0.0000, NULL, 0.1200),
('buyoff', 'Rosewood 2D MM', 'Coil_recess_DTM', NULL, NULL, 0.0000, NULL, 0.2500),
('buyoff', 'Rosewood 2D MM', 'Coil_recess_NDTM', NULL, NULL, 0.0000, NULL, 0.2500),
('buyoff', 'Rosewood 2D MM', 'Bobbin_recess_DTM', NULL, NULL, NULL, NULL, 0.2500),
('buyoff', 'Rosewood 2D MM', 'Bobbin_recess_NDTM', NULL, NULL, NULL, NULL, 0.2500),

-- skybolt1d
('buyoff', 'Skybolt 1D MM', 'X1', 17.1500, NULL, 17.3400, NULL, 17.5300),
('buyoff', 'Skybolt 1D MM', 'Y1', 5.6600, NULL, 5.8500, NULL, 6.0400),
('buyoff', 'Skybolt 1D MM', 'X2', 17.1500, NULL, 17.3400, NULL, 17.5300),
('buyoff', 'Skybolt 1D MM', 'Y2', 5.6600, NULL, 5.8500, NULL, 6.0400),
('buyoff', 'Skybolt 1D MM', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'Skybolt 1D MM', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'Skybolt 1D MM', 'Epoxy_length_1', 14.3900, 14.5805, 15.6600, 16.7395, 16.9300),
('buyoff', 'Skybolt 1D MM', 'Epoxy_length_2', 14.3900, 14.5805, 15.6600, 16.7395, 16.9300),
('buyoff', 'Skybolt 1D MM', 'Crash_stop_profile_1', 6.5620, 6.5677, 6.6000, 6.6323, 6.6380),
('buyoff', 'Skybolt 1D MM', 'Crash_stop_profile_2', 6.5620, 6.5677, 6.6000, 6.6323, 6.6380),
('buyoff', 'Skybolt 1D MM', 'Coil_symmetry', 4.1500, 4.1650, 4.2500, 4.3350, 4.3500),
('buyoff', 'Skybolt 1D MM', 'Coil_parallel', 0.0000, NULL, NULL, NULL, 0.1500),
('buyoff', 'Skybolt 1D MM', 'Coil_recess_DTM', 0.0000, NULL, NULL, NULL, 0.2500),
('buyoff', 'Skybolt 1D MM', 'Coil_recess_NDTM', 0.0000, NULL, NULL, NULL, 0.2500),

-- skybolt2d
('buyoff', 'Skybolt 2D MM', 'X1', 16.9900, 17.0190, 17.1800, 17.3420, 17.3700),
('buyoff', 'Skybolt 2D MM', 'Y1', 5.5900, 5.6190, 5.7800, 5.9420, 5.9700),
('buyoff', 'Skybolt 2D MM', 'X2', 16.9900, 17.0190, 17.1800, 17.3420, 17.3700),
('buyoff', 'Skybolt 2D MM', 'Y2', 5.5900, 5.6190, 5.7800, 5.9420, 5.9700),
('buyoff', 'Skybolt 2D MM', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'Skybolt 2D MM', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'Skybolt 2D MM', 'Epoxy_length_1', 14.2800, 14.4710, 15.5500, 16.6300, 16.8200),
('buyoff', 'Skybolt 2D MM', 'Epoxy_length_2', 14.2300, 14.4210, 15.5000, 16.5800, 16.7700),
('buyoff', 'Skybolt 2D MM', 'Crash_stop_profile_1', 6.5620, 6.5680, 6.6000, 6.6320, 6.6380),
('buyoff', 'Skybolt 2D MM', 'Crash_stop_profile_2', 6.5620, 6.5680, 6.6000, 6.6320, 6.6380),
('buyoff', 'Skybolt 2D MM', 'Coil_symmetry', 4.9500, NULL, 5.0500, NULL, 5.1500),
('buyoff', 'Skybolt 2D MM', 'Coil_parallel', NULL, 0.0044, NULL, 0.0227, 0.1500),
('buyoff', 'Skybolt 2D MM', 'Coil_recess_DTM', NULL, 0.0542, NULL, 0.2138, 0.2500),
('buyoff', 'Skybolt 2D MM', 'Coil_recess_NDTM', NULL, 0.0533, NULL, 0.1665, 0.2500),

-- skybolt3d
('buyoff', 'Skybolt 3D MM', 'X1', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('buyoff', 'Skybolt 3D MM', 'Y1', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('buyoff', 'Skybolt 3D MM', 'X2', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('buyoff', 'Skybolt 3D MM', 'Y2', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('buyoff', 'Skybolt 3D MM', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'Skybolt 3D MM', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'Skybolt 3D MM', 'Epoxy_length_1', 13.9900, 14.1805, 15.2600, 16.3395, 16.5300),
('buyoff', 'Skybolt 3D MM', 'Epoxy_length_2', 14.2900, 14.4805, 15.5600, 16.6395, 16.8300),
('buyoff', 'Skybolt 3D MM', 'Crash_stop_profile_1', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('buyoff', 'Skybolt 3D MM', 'Crash_stop_profile_2', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('buyoff', 'Skybolt 3D MM', 'Coil_symmetry', 4.9100, 4.9250, 5.0100, 5.0950, 5.1100),
('buyoff', 'Skybolt 3D MM', 'Coil_parallel', NULL, 0.0041, NULL, 0.0114, 0.1500),
('buyoff', 'Skybolt 3D MM', 'Coil_recess_DTM', NULL, 0.0715, NULL, 0.1635, 0.2500),
('buyoff', 'Skybolt 3D MM', 'Coil_recess_NDTM', NULL, 0.0712, NULL, 0.2042, 0.2500),

-- skybolt4d
('buyoff', 'Skybolt 4D MM', 'X1', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('buyoff', 'Skybolt 4D MM', 'Y1', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('buyoff', 'Skybolt 4D MM', 'X2', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('buyoff', 'Skybolt 4D MM', 'Y2', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('buyoff', 'Skybolt 4D MM', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'Skybolt 4D MM', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'Skybolt 4D MM', 'Epoxy_length_1', 13.9900, 14.1810, 15.2600, 16.3400, 16.5300),
('buyoff', 'Skybolt 4D MM', 'Epoxy_length_2', 14.2900, 14.4810, 15.5600, 16.6400, 16.8300),
('buyoff', 'Skybolt 4D MM', 'Crash_stop_profile_1', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('buyoff', 'Skybolt 4D MM', 'Crash_stop_profile_2', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('buyoff', 'Skybolt 4D MM', 'Coil_symmetry', 4.9100, 4.9250, 5.0100, 5.0950, 5.1100),
('buyoff', 'Skybolt 4D MM', 'Coil_parallel', NULL, 0.0090, NULL, 0.0313, 0.1500),
('buyoff', 'Skybolt 4D MM', 'Coil_recess_DTM', NULL, 0.0940, NULL, 0.2220, 0.2500),
('buyoff', 'Skybolt 4D MM', 'Coil_recess_NDTM', NULL, 0.1102, NULL, 0.2312, 0.2500),

-- summit10d
('buyoff', 'Summit 10D Inch', 'X1', 0.6125, NULL, 0.6200, NULL, 0.6275),
('buyoff', 'Summit 10D Inch', 'Y1', -0.0075, NULL, 0.0000, NULL, 0.0075),
('buyoff', 'Summit 10D Inch', 'X2', 0.8725, NULL, 0.8800, NULL, 0.8875),
('buyoff', 'Summit 10D Inch', 'Y2', -0.0075, NULL, 0.0000, NULL, 0.0075),
('buyoff', 'Summit 10D Inch', 'X3', 0.9150, NULL, 0.9220, NULL, 0.9290),
('buyoff', 'Summit 10D Inch', 'Y3', 0.2740, NULL, 0.2810, NULL, 0.2880),
('buyoff', 'Summit 10D Inch', 'X4', 0.9150, NULL, 0.9220, NULL, 0.9290),
('buyoff', 'Summit 10D Inch', 'Y4', 0.2740, NULL, 0.2810, NULL, 0.2880),
('buyoff', 'Summit 10D Inch', 'Bobbin_hole_true', 0.0000, NULL, 0.0000, NULL, 0.0150),
('buyoff', 'Summit 10D Inch', 'Bobbin_slote_true', 0.0000, NULL, 0.0000, NULL, 0.0150),
('buyoff', 'Summit 10D Inch', 'Coil_position_1', 0.0000, NULL, NULL, NULL, 0.0140),
('buyoff', 'Summit 10D Inch', 'Coil_position_2', 0.0000, NULL, NULL, NULL, 0.0140),
('buyoff', 'Summit 10D Inch', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'Summit 10D Inch', 'Epoxy_length_2', 0.0300, NULL, NULL, NULL, 0.1000),
('buyoff', 'Summit 10D Inch', 'Crash_stop_profile_1', 0.1345, NULL, 0.1370, NULL, 0.1395),
('buyoff', 'Summit 10D Inch', 'Crash_stop_profile_2', -0.0025, NULL, 0.0000, NULL, 0.0025),
('buyoff', 'Summit 10D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'Summit 10D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Summit 10D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Summit 10D Inch', 'Bobbin_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'Summit 10D Inch', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'Summit 10D Inch', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v111d
('buyoff', 'V11 1D Inch', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'V11 1D Inch', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'V11 1D Inch', 'Epoxy_length_1', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'V11 1D Inch', 'Epoxy_length_2', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'V11 1D Inch', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('buyoff', 'V11 1D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'V11 1D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'V11 1D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v112d
('buyoff', 'V11 2D Inch', 'X1', 0.8210, NULL, 0.8340, NULL, 0.8350),
('buyoff', 'V11 2D Inch', 'Y1', 0.2910, NULL, 0.3040, NULL, 0.3050),
('buyoff', 'V11 2D Inch', 'X2', 0.8210, NULL, 0.8340, NULL, 0.8350),
('buyoff', 'V11 2D Inch', 'Y2', 0.2910, NULL, 0.3040, NULL, 0.3050),
('buyoff', 'V11 2D Inch', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'V11 2D Inch', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'V11 2D Inch', 'Epoxy_length_1_S', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'V11 2D Inch', 'Epoxy_length_2_L', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'V11 2D Inch', 'Crash_stop_profile_1', -0.0025, -0.0018, 0.0000, 0.0018, 0.0025),
('buyoff', 'V11 2D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'V11 2D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'V11 2D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v114d
('buyoff', 'V11 4D Inch', 'X1', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('buyoff', 'V11 4D Inch', 'Y1', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('buyoff', 'V11 4D Inch', 'X2', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('buyoff', 'V11 4D Inch', 'Y2', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('buyoff', 'V11 4D Inch', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'V11 4D Inch', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'V11 4D Inch', 'Epoxy_length_1_S', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'V11 4D Inch', 'Epoxy_length_2_L', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'V11 4D Inch', 'Crash_stop_profile_1', -0.0025, -0.0018, 0.0000, 0.0018, 0.0025),
('buyoff', 'V11 4D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'V11 4D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'V11 4D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v15cmr4d
('buyoff', 'V15 Cimarron 4D Inch', 'X1', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('buyoff', 'V15 Cimarron 4D Inch', 'Y1', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('buyoff', 'V15 Cimarron 4D Inch', 'X2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'V15 Cimarron 4D Inch', 'Y2', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('buyoff', 'V15 Cimarron 4D Inch', 'Coil_position_1', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('buyoff', 'V15 Cimarron 4D Inch', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'V15 Cimarron 4D Inch', 'Epoxy_length_1', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'V15 Cimarron 4D Inch', 'Epoxy_length_2', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'V15 Cimarron 4D Inch', 'Crash_stop_profile_1', -0.0025, -0.0018, 0.0000, 0.0018, 0.0025),
('buyoff', 'V15 Cimarron 4D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'V15 Cimarron 4D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'V15 Cimarron 4D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- ==========================================
-- MODE: ROVING
-- ==========================================
-- cmr3d
('roving', 'Cimarron BP 3D Inch', 'Coil_outer_profile_u', 0.9500, NULL, 0.9570, NULL, 0.9650),
('roving', 'Cimarron BP 3D Inch', 'Coil_outer_profile_v', 0.9500, NULL, 0.9570, NULL, 0.9650),
('roving', 'Cimarron BP 3D Inch', 'Coil_outer_profile_w', 0.9500, NULL, 0.9570, NULL, 0.9650),
('roving', 'Cimarron BP 3D Inch', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'Cimarron BP 3D Inch', 'Epoxy_length_2', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'Cimarron BP 3D Inch', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('roving', 'Cimarron BP 3D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'Cimarron BP 3D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Cimarron BP 3D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- cmr4d
('roving', 'Cimarron BP 4D Inch', 'X1', 0.5625, NULL, 0.5700, NULL, 0.5775),
('roving', 'Cimarron BP 4D Inch', 'Y1', -0.0075, NULL, 0.0000, NULL, 0.0075),
('roving', 'Cimarron BP 4D Inch', 'X2', 0.9125, NULL, 0.9200, NULL, 0.9275),
('roving', 'Cimarron BP 4D Inch', 'Y2', -0.0075, NULL, 0.0000, NULL, 0.0075),
('roving', 'Cimarron BP 4D Inch', 'Coil_outer_profile_u', 1.1725, NULL, 1.1820, NULL, 1.1915),
('roving', 'Cimarron BP 4D Inch', 'Coil_outer_profile_v', 1.1725, NULL, 1.1820, NULL, 1.1915),
('roving', 'Cimarron BP 4D Inch', 'Coil_outer_profile_w', 1.1725, NULL, 1.1820, NULL, 1.1915),
('roving', 'Cimarron BP 4D Inch', 'Bobbin_position_1', 0.0000, NULL, NULL, NULL, 0.0150),
('roving', 'Cimarron BP 4D Inch', 'Bobbin_position_2', 0.0000, NULL, NULL, NULL, 0.0150),
('roving', 'Cimarron BP 4D Inch', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'Cimarron BP 4D Inch', 'Epoxy_length_2', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'Cimarron BP 4D Inch', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('roving', 'Cimarron BP 4D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'Cimarron BP 4D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Cimarron BP 4D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Cimarron BP 4D Inch', 'Bobbin_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'Cimarron BP 4D Inch', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Cimarron BP 4D Inch', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- cmr5d
('roving', 'Cimarron BP 5D Inch', 'X1', 0.5625, NULL, 0.5700, NULL, 0.5775),
('roving', 'Cimarron BP 5D Inch', 'Y1', -0.0075, NULL, 0.0000, NULL, 0.0075),
('roving', 'Cimarron BP 5D Inch', 'X2', 0.9125, NULL, 0.9200, NULL, 0.9275),
('roving', 'Cimarron BP 5D Inch', 'Y2', -0.0075, NULL, 0.0000, NULL, 0.0075),
('roving', 'Cimarron BP 5D Inch', 'Coil_outer_profile_u', 1.1925, NULL, 1.2020, NULL, 1.2115),
('roving', 'Cimarron BP 5D Inch', 'Coil_outer_profile_v', 1.1925, NULL, 1.2020, NULL, 1.2115),
('roving', 'Cimarron BP 5D Inch', 'Coil_outer_profile_w', 1.1925, NULL, 1.2020, NULL, 1.2115),
('roving', 'Cimarron BP 5D Inch', 'Bobbin_position_1', 0.0000, NULL, NULL, NULL, 0.0150),
('roving', 'Cimarron BP 5D Inch', 'Bobbin_position_2', 0.0000, NULL, NULL, NULL, 0.0150),
('roving', 'Cimarron BP 5D Inch', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'Cimarron BP 5D Inch', 'Epoxy_length_2', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'Cimarron BP 5D Inch', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('roving', 'Cimarron BP 5D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'Cimarron BP 5D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Cimarron BP 5D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Cimarron BP 5D Inch', 'Bobbin_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'Cimarron BP 5D Inch', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Cimarron BP 5D Inch', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- comet
('roving', 'ComET MM', 'X1', 20.9562, NULL, 21.0340, NULL, 21.2118),
('roving', 'ComET MM', 'Y1', 7.3832, NULL, 7.5610, NULL, 7.7388),
('roving', 'ComET MM', 'X2', 20.9562, NULL, 21.0340, NULL, 21.2118),
('roving', 'ComET MM', 'Y2', 7.3832, NULL, 7.5610, NULL, 7.7388),
('roving', 'ComET MM', 'Coil_position_1', 0.0000, NULL, NULL, 0.2845, 0.3556),
('roving', 'ComET MM', 'Coil_position_2', 0.0000, NULL, NULL, 0.2845, 0.3556),
('roving', 'ComET MM', 'Epoxy_length_1', -1.2700, NULL, 0.0000, NULL, 1.2700),
('roving', 'ComET MM', 'Epoxy_length_2', -1.2700, NULL, 0.0000, NULL, 1.2700),
('roving', 'ComET MM', 'Crash_stop_profile_1', -0.0600, -0.0300, 0.0000, 0.0300, 0.0600),
('roving', 'ComET MM', 'Coil_parallel', NULL, NULL, NULL, NULL, 0.1520),
('roving', 'ComET MM', 'Coil_recess_DTM', NULL, NULL, NULL, NULL, 0.2500),
('roving', 'ComET MM', 'Coil_recess_NDTM', NULL, NULL, NULL, NULL, 0.2500),

-- dorado10d
('roving', 'Dorado 10D NOAR', 'X1_Center', 0.6140, 0.6150, 0.6200, 0.6250, 0.6260),
('roving', 'Dorado 10D NOAR', 'X1', 0.8780, 0.8790, 0.8830, 0.8870, 0.8880),
('roving', 'Dorado 10D NOAR', 'Y1', 0.2690, 0.2700, 0.2740, 0.2780, 0.2790),
('roving', 'Dorado 10D NOAR', 'X2', 0.8780, 0.8790, 0.8830, 0.8870, 0.8880),
('roving', 'Dorado 10D NOAR', 'Y2', 0.2690, 0.2700, 0.2740, 0.2780, 0.2790),
('roving', 'Dorado 10D NOAR', 'Coil_position_1_S', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('roving', 'Dorado 10D NOAR', 'Coil_position_2_L', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('roving', 'Dorado 10D NOAR', 'Epoxy_length_1_S', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'Dorado 10D NOAR', 'Epoxy_length_2_L', 0.9500, NULL, 0.9950, NULL, 1.0700),
('roving', 'Dorado 10D NOAR', 'Crash_stop_profile_1_L', 0.3775, 0.3780, 0.3800, 0.3820, 0.3825),
('roving', 'Dorado 10D NOAR', 'Crash_stop_profile_2_S', -0.0025, -0.0020, 0.0000, 0.0020, 0.0025),
('roving', 'Dorado 10D NOAR', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'Dorado 10D NOAR', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Dorado 10D NOAR', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Dorado 10D NOAR', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Dorado 10D NOAR', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- marlin10d
('roving', 'Marlin 10D AL BB', 'X1_Center', 0.6550, NULL, 0.6600, NULL, 0.6650),
('roving', 'Marlin 10D AL BB', 'X1', 0.9150, NULL, 0.9220, NULL, 0.9290),
('roving', 'Marlin 10D AL BB', 'Y1', 0.2740, NULL, 0.2810, NULL, 0.2880),
('roving', 'Marlin 10D AL BB', 'X2', 0.9150, NULL, 0.9220, NULL, 0.9290),
('roving', 'Marlin 10D AL BB', 'Y2', 0.2740, NULL, 0.2810, NULL, 0.2880),
('roving', 'Marlin 10D AL BB', 'Coil_position_1_S', 0.0000, NULL, NULL, NULL, 0.0140),
('roving', 'Marlin 10D AL BB', 'Coil_position_2_L', 0.0000, NULL, NULL, NULL, 0.0140),
('roving', 'Marlin 10D AL BB', 'Epoxy_length_1_S', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'Marlin 10D AL BB', 'Epoxy_length_2_L', 0.0300, NULL, NULL, NULL, 0.1000),
('roving', 'Marlin 10D AL BB', 'Crash_stop_profile_1_L', 0.1345, NULL, 0.1375, NULL, 0.1395),
('roving', 'Marlin 10D AL BB', 'Crash_stop_profile_2_S', -0.0025, NULL, 0.0000, NULL, 0.0025),
('roving', 'Marlin 10D AL BB', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'Marlin 10D AL BB', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Marlin 10D AL BB', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Marlin 10D AL BB', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Marlin 10D AL BB', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- m11
('roving', 'M11 P MM', 'Epoxy_length_1_L', 7.2100, NULL, NULL, NULL, 8.7100),
('roving', 'M11 P MM', 'Epoxy_length_2_S', 16.5000, NULL, NULL, NULL, 18.0000),
('roving', 'M11 P MM', 'Fantail_profile_1', 9.3300, NULL, NULL, NULL, 9.4300),
('roving', 'M11 P MM', 'Fantail_profile_2', 17.1000, NULL, NULL, NULL, 17.2000),
('roving', 'M11 P MM', 'Fantail_profile_3', 0.9600, NULL, NULL, NULL, 1.1200),
('roving', 'M11 P MM', 'Fantail_profile_4', 17.9200, NULL, NULL, NULL, 18.0800),
('roving', 'M11 P MM', 'Fantail_profile_5', 4.3100, NULL, NULL, NULL, 4.4100),
('roving', 'M11 P MM', 'Coil_recess_DTM', NULL, NULL, NULL, NULL, 0.3800),
('roving', 'M11 P MM', 'Coil_recess_NDTM', NULL, NULL, NULL, NULL, 0.3800),

-- rosewood1d
('roving', 'Rosewood 1D MM', 'Coil_inner_profile_1', 0.8900, NULL, 1.0700, NULL, 1.2500),
('roving', 'Rosewood 1D MM', 'Coil_inner_profile_u', 16.2200, NULL, 16.4000, NULL, 16.5800),
('roving', 'Rosewood 1D MM', 'Coil_inner_profile_v', 16.2200, NULL, 16.4000, NULL, 16.5800),
('roving', 'Rosewood 1D MM', 'Coil_inner_profile_w', 16.2200, NULL, 16.4000, NULL, 16.5800),
('roving', 'Rosewood 1D MM', 'Epoxy_length_1', 10.9760, NULL, 11.3560, NULL, 12.2560),
('roving', 'Rosewood 1D MM', 'Epoxy_length_2', 14.0730, NULL, 14.4530, NULL, 15.3530),
('roving', 'Rosewood 1D MM', 'Crash_stop_profile_1', 8.7090, NULL, 8.7710, NULL, 8.8340),
('roving', 'Rosewood 1D MM', 'Crash_stop_profile_2', 0.9540, NULL, 1.0160, NULL, 1.0790),
('roving', 'Rosewood 1D MM', 'Crash_stop_profile_3', 16.8930, NULL, 16.9550, NULL, 17.0180),
('roving', 'Rosewood 1D MM', 'Coil_parallel', NULL, NULL, 0.0000, NULL, 0.1200),
('roving', 'Rosewood 1D MM', 'Coil_recess_DTM', NULL, NULL, 0.0000, NULL, 0.2500),
('roving', 'Rosewood 1D MM', 'Coil_recess_NDTM', NULL, NULL, 0.0000, NULL, 0.2500),

-- rosewood2d
('roving', 'Rosewood 2D MM', 'Coil_inner_profile_1', -0.1600, NULL, 0.0200, NULL, 0.2000),
('roving', 'Rosewood 2D MM', 'Coil_inner_profile_2', -0.1600, NULL, 0.0200, NULL, 0.2000),
('roving', 'Rosewood 2D MM', 'Coil_inner_profile_UV', 15.7480, NULL, 15.9280, NULL, 16.1080),
('roving', 'Rosewood 2D MM', 'Epoxy_length_1', 12.5690, NULL, 12.9490, NULL, 13.6990),
('roving', 'Rosewood 2D MM', 'Epoxy_length_2', 14.1700, NULL, 14.5500, NULL, 15.3000),
('roving', 'Rosewood 2D MM', 'Crash_stop_profile_1', 8.7090, NULL, 8.7710, NULL, 8.8340),
('roving', 'Rosewood 2D MM', 'Crash_stop_profile_2', 0.9540, NULL, 1.0160, NULL, 1.0790),
('roving', 'Rosewood 2D MM', 'Crash_stop_profile_3', 12.1490, NULL, 12.2110, NULL, 12.2740),
('roving', 'Rosewood 2D MM', 'Coil_parallel', NULL, NULL, 0.0000, NULL, 0.1200),
('roving', 'Rosewood 2D MM', 'Coil_recess_DTM', NULL, NULL, 0.0000, NULL, 0.2500),
('roving', 'Rosewood 2D MM', 'Coil_recess_NDTM', NULL, NULL, 0.0000, NULL, 0.2500),
('roving', 'Rosewood 2D MM', 'Bobbin_recess_DTM', NULL, NULL, NULL, NULL, 0.2500),
('roving', 'Rosewood 2D MM', 'Bobbin_recess_NDTM', NULL, NULL, NULL, NULL, 0.2500),

-- skybolt1d
('roving', 'Skybolt 1Q MM', 'X1', 17.1500, NULL, 17.3400, NULL, 17.5300),
('roving', 'Skybolt 1Q MM', 'Y1', 5.6600, NULL, 5.8500, NULL, 6.0400),
('roving', 'Skybolt 1Q MM', 'X2', 17.1500, NULL, 17.3400, NULL, 17.5300),
('roving', 'Skybolt 1Q MM', 'Y2', 5.6600, NULL, 5.8500, NULL, 6.0400),
('roving', 'Skybolt 1Q MM', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'Skybolt 1Q MM', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'Skybolt 1Q MM', 'Epoxy_length_1', 14.3900, 14.5805, 15.6600, 16.7395, 16.9300),
('roving', 'Skybolt 1Q MM', 'Epoxy_length_2', 14.3900, 14.5805, 15.6600, 16.7395, 16.9300),
('roving', 'Skybolt 1Q MM', 'Crash_stop_profile_1', 6.5620, 6.5677, 6.6000, 6.6323, 6.6380),
('roving', 'Skybolt 1Q MM', 'Crash_stop_profile_2', 6.5620, 6.5677, 6.6000, 6.6323, 6.6380),
('roving', 'Skybolt 1Q MM', 'Coil_symmetry', 4.1500, 4.1650, 4.2500, 4.3350, 4.3500),
('roving', 'Skybolt 1Q MM', 'Coil_parallel', 0.0000, NULL, NULL, NULL, 0.1500),
('roving', 'Skybolt 1Q MM', 'Coil_recess_DTM', 0.0000, NULL, NULL, NULL, 0.2500),
('roving', 'Skybolt 1Q MM', 'Coil_recess_NDTM', 0.0000, NULL, NULL, NULL, 0.2500),

-- skybolt2d
('roving', 'Skybolt 2D MM', 'X1', 16.9900, 17.0190, 17.1800, 17.3420, 17.3700),
('roving', 'Skybolt 2D MM', 'Y1', 5.5900, 5.6190, 5.7800, 5.9420, 5.9700),
('roving', 'Skybolt 2D MM', 'X2', 16.9900, 17.0190, 17.1800, 17.3420, 17.3700),
('roving', 'Skybolt 2D MM', 'Y2', 5.5900, 5.6190, 5.7800, 5.9420, 5.9700),
('roving', 'Skybolt 2D MM', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'Skybolt 2D MM', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'Skybolt 2D MM', 'Epoxy_length_1', 14.2800, 14.4710, 15.5500, 16.6300, 16.8200),
('roving', 'Skybolt 2D MM', 'Epoxy_length_2', 14.2300, 14.4210, 15.5000, 16.5800, 16.7700),
('roving', 'Skybolt 2D MM', 'Crash_stop_profile_1', 6.5620, 6.5680, 6.6000, 6.6320, 6.6380),
('roving', 'Skybolt 2D MM', 'Crash_stop_profile_2', 6.5620, 6.5680, 6.6000, 6.6320, 6.6380),
('roving', 'Skybolt 2D MM', 'Coil_symmetry', 4.9500, NULL, 5.0500, NULL, 5.1500),
('roving', 'Skybolt 2D MM', 'Coil_parallel', NULL, 0.0044, NULL, 0.0227, 0.1500),
('roving', 'Skybolt 2D MM', 'Coil_recess_DTM', NULL, 0.0542, NULL, 0.2138, 0.2500),
('roving', 'Skybolt 2D MM', 'Coil_recess_NDTM', NULL, 0.0533, NULL, 0.1665, 0.2500),

-- skybolt3d
('roving', 'Skybolt 3D MM', 'X1', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('roving', 'Skybolt 3D MM', 'Y1', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('roving', 'Skybolt 3D MM', 'X2', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('roving', 'Skybolt 3D MM', 'Y2', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('roving', 'Skybolt 3D MM', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'Skybolt 3D MM', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'Skybolt 3D MM', 'Epoxy_length_1', 13.9900, 14.1805, 15.2600, 16.3395, 16.5300),
('roving', 'Skybolt 3D MM', 'Epoxy_length_2', 14.2900, 14.4805, 15.5600, 16.6395, 16.8300),
('roving', 'Skybolt 3D MM', 'Crash_stop_profile_1', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('roving', 'Skybolt 3D MM', 'Crash_stop_profile_2', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('roving', 'Skybolt 3D MM', 'Coil_symmetry', 4.9100, 4.9250, 5.0100, 5.0950, 5.1100),
('roving', 'Skybolt 3D MM', 'Coil_parallel', NULL, 0.0041, NULL, 0.0114, 0.1500),
('roving', 'Skybolt 3D MM', 'Coil_recess_DTM', NULL, 0.0715, NULL, 0.1635, 0.2500),
('roving', 'Skybolt 3D MM', 'Coil_recess_NDTM', NULL, 0.0712, NULL, 0.2042, 0.2500),

-- skybolt4d
('roving', 'Skybolt 4D MM', 'X1', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('roving', 'Skybolt 4D MM', 'Y1', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('roving', 'Skybolt 4D MM', 'X2', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('roving', 'Skybolt 4D MM', 'Y2', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('roving', 'Skybolt 4D MM', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'Skybolt 4D MM', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'Skybolt 4D MM', 'Epoxy_length_1', 13.9900, 14.1810, 15.2600, 16.3400, 16.5300),
('roving', 'Skybolt 4D MM', 'Epoxy_length_2', 14.2900, 14.4810, 15.5600, 16.6400, 16.8300),
('roving', 'Skybolt 4D MM', 'Crash_stop_profile_1', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('roving', 'Skybolt 4D MM', 'Crash_stop_profile_2', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('roving', 'Skybolt 4D MM', 'Coil_symmetry', 4.9100, 4.9250, 5.0100, 5.0950, 5.1100),
('roving', 'Skybolt 4D MM', 'Coil_parallel', NULL, 0.0090, NULL, 0.0313, 0.1500),
('roving', 'Skybolt 4D MM', 'Coil_recess_DTM', NULL, 0.0940, NULL, 0.2220, 0.2500),
('roving', 'Skybolt 4D MM', 'Coil_recess_NDTM', NULL, 0.1102, NULL, 0.2312, 0.2500),

-- summit10d
('roving', 'Summit 10D Inch', 'X1', 0.6125, NULL, 0.6200, NULL, 0.6275),
('roving', 'Summit 10D Inch', 'Y1', -0.0075, NULL, 0.0000, NULL, 0.0075),
('roving', 'Summit 10D Inch', 'X2', 0.8725, NULL, 0.8800, NULL, 0.8875),
('roving', 'Summit 10D Inch', 'Y2', -0.0075, NULL, 0.0000, NULL, 0.0075),
('roving', 'Summit 10D Inch', 'X3', 0.9150, NULL, 0.9220, NULL, 0.9290),
('roving', 'Summit 10D Inch', 'Y3', 0.2740, NULL, 0.2810, NULL, 0.2880),
('roving', 'Summit 10D Inch', 'X4', 0.9150, NULL, 0.9220, NULL, 0.9290),
('roving', 'Summit 10D Inch', 'Y4', 0.2740, NULL, 0.2810, NULL, 0.2880),
('roving', 'Summit 10D Inch', 'Bobbin_hole_true', 0.0000, NULL, 0.0000, NULL, 0.0150),
('roving', 'Summit 10D Inch', 'Bobbin_slote_true', 0.0000, NULL, 0.0000, NULL, 0.0150),
('roving', 'Summit 10D Inch', 'Coil_position_1', 0.0000, NULL, NULL, NULL, 0.0140),
('roving', 'Summit 10D Inch', 'Coil_position_2', 0.0000, NULL, NULL, NULL, 0.0140),
('roving', 'Summit 10D Inch', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'Summit 10D Inch', 'Epoxy_length_2', 0.0300, NULL, NULL, NULL, 0.1000),
('roving', 'Summit 10D Inch', 'Crash_stop_profile_1', 0.1345, NULL, 0.1370, NULL, 0.1395),
('roving', 'Summit 10D Inch', 'Crash_stop_profile_2', -0.0025, NULL, 0.0000, NULL, 0.0025),
('roving', 'Summit 10D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'Summit 10D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Summit 10D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Summit 10D Inch', 'Bobbin_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'Summit 10D Inch', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'Summit 10D Inch', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v111d
('roving', 'V11 1D Inch', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'V11 1D Inch', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'V11 1D Inch', 'Epoxy_length_1', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'V11 1D Inch', 'Epoxy_length_2', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'V11 1D Inch', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('roving', 'V11 1D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'V11 1D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'V11 1D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v112d
('roving', 'V11 2D Inch', 'X1', 0.8210, NULL, 0.8340, NULL, 0.8350),
('roving', 'V11 2D Inch', 'Y1', 0.2910, NULL, 0.3040, NULL, 0.3050),
('roving', 'V11 2D Inch', 'X2', 0.8210, NULL, 0.8340, NULL, 0.8350),
('roving', 'V11 2D Inch', 'Y2', 0.2910, NULL, 0.3040, NULL, 0.3050),
('roving', 'V11 2D Inch', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'V11 2D Inch', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'V11 2D Inch', 'Epoxy_length_1_S', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'V11 2D Inch', 'Epoxy_length_2_L', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'V11 2D Inch', 'Crash_stop_profile_1', -0.0025, -0.0018, 0.0000, 0.0018, 0.0025),
('roving', 'V11 2D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'V11 2D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'V11 2D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v114d
('roving', 'V11 4D Inch', 'X1', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('roving', 'V11 4D Inch', 'Y1', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('roving', 'V11 4D Inch', 'X2', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('roving', 'V11 4D Inch', 'Y2', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('roving', 'V11 4D Inch', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'V11 4D Inch', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'V11 4D Inch', 'Epoxy_length_1_S', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'V11 4D Inch', 'Epoxy_length_2_L', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'V11 4D Inch', 'Crash_stop_profile_1', -0.0025, -0.0018, 0.0000, 0.0018, 0.0025),
('roving', 'V11 4D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'V11 4D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'V11 4D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v15cmr4d
('roving', 'V15 Cimarron 4D Inch', 'X1', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('roving', 'V15 Cimarron 4D Inch', 'Y1', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('roving', 'V15 Cimarron 4D Inch', 'X2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'V15 Cimarron 4D Inch', 'Y2', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('roving', 'V15 Cimarron 4D Inch', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'V15 Cimarron 4D Inch', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'V15 Cimarron 4D Inch', 'Epoxy_length_1', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'V15 Cimarron 4D Inch', 'Epoxy_length_2', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'V15 Cimarron 4D Inch', 'Crash_stop_profile_1', -0.0025, -0.0018, 0.0000, 0.0018, 0.0025),
('roving', 'V15 Cimarron 4D Inch', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'V15 Cimarron 4D Inch', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'V15 Cimarron 4D Inch', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100);
-- Migrate old products to master_products
INSERT IGNORE INTO master_products (product_key, product_name) SELECT DISTINCT product_name, product_name FROM dispensing_product;
INSERT IGNORE INTO master_products (product_key, product_name) SELECT DISTINCT product_name, product_name FROM laser_product;
INSERT IGNORE INTO master_products (product_key, product_name) SELECT DISTINCT product_name, product_name FROM pof_product;
INSERT IGNORE INTO master_products (product_key, product_name) SELECT DISTINCT product_name, product_name FROM damper_product;