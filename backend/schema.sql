-- ============================================================
-- schema.sql รขโฌโ€ Belton IPQC Database
-- This schema has been fully corrected and EXPANDED to explicitly 
-- support all measurement dimensions as columns, eliminating
-- reliance solely on JSON fields.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS dispensing_alerts;
DROP TABLE IF EXISTS dispensing_measurements;
DROP TABLE IF EXISTS dispensing_records;
DROP TABLE IF EXISTS dispensing_product;
DROP TABLE IF EXISTS dispensing_configs;
DROP TABLE IF EXISTS dispensing_config;
DROP TABLE IF EXISTS alert_recipients;

DROP TABLE IF EXISTS laser_alerts;
DROP TABLE IF EXISTS laser_records;
DROP TABLE IF EXISTS laser_config;

DROP TABLE IF EXISTS pof_alerts;
DROP TABLE IF EXISTS pof_records;
DROP TABLE IF EXISTS pof_product;
DROP TABLE IF EXISTS pof_config;

DROP TABLE IF EXISTS damper_alerts;
DROP TABLE IF EXISTS damper_records;
DROP TABLE IF EXISTS damper_product;
DROP TABLE IF EXISTS damper_config;

DROP TABLE IF EXISTS spc_config_limits;
DROP TABLE IF EXISTS system_config;
DROP TABLE IF EXISTS system_alert;

SET FOREIGN_KEY_CHECKS = 1;

CREATE DATABASE IF NOT EXISTS belton_ipqc CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE belton_ipqc;

-- ==============================================================================
-- 1. SPC CONFIG LIMITS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS spc_config_limits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    process_mode VARCHAR(50),
    product_key VARCHAR(100),
    dimension_name VARCHAR(100),
    lsl DECIMAL(10,4),
    lcl DECIMAL(10,4),
    cl DECIMAL(10,4),
    ucl DECIMAL(10,4),
    usl DECIMAL(10,4),
    frequency INT,
    laser_qty INT,
    laser_fixture INT,
    laser_shift INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_process_product_dim (process_mode, product_key, dimension_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- 2. DISPENSING MODULE
-- ==============================================================================
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
    product_id VARCHAR(100),
    qty_pcs INT,
    qty_shift INT,
    qty_oven INT,
    usl DECIMAL(10,4),
    ucl DECIMAL(10,4),
    cl DECIMAL(10,4),
    lcl DECIMAL(10,4),
    lsl DECIMAL(10,4),
    config_key VARCHAR(100),
    config_value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
    product_name VARCHAR(100) NOT NULL UNIQUE,
    product_key  VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS laser_product (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pof_product (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS damper_product (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==============================================================================
-- 8. INITIAL DATA: PRODUCT SEEDING
-- ==============================================================================

-- MASTER PRODUCTS
INSERT IGNORE INTO master_products (product_key, product_name, dims) VALUES
('cmr3d', 'CimarronBP 3D', '["Coil_outer_profile_u", "Coil_outer_profile_v", "Coil_outer_profile_w", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('cmr4d', 'CimarronBP 4D', '["Coil_outer_profile_u", "Coil_outer_profile_v", "Coil_outer_profile_w", "X1", "Y1", "Bobbin_position_1", "X2", "Y2", "Bobbin_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_parallel","n":7}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('cmr5d', 'CimarronBP 5D', '["Coil_outer_profile_u", "Coil_outer_profile_v", "Coil_outer_profile_w", "X1", "Y1", "Bobbin_position_1", "X2", "Y2", "Bobbin_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_parallel","n":7}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('dorado5d', 'Dorado 5D', '["X1", "Y1", "Coil_position_1_S", "X2", "Y2", "Coil_position_2_L", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1_L", "Crash_stop_profile_2_S", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('dorado5dbb', 'Dorado 5D AL BB', '["X1", "Y1", "Coil_position_1_S", "X2", "Y2", "Coil_position_2_L", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1_L", "Crash_stop_profile_2_S", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('dorado10d', 'Dorado 10D', '["X1_Center", "X1", "Y1", "Coil_position_1_S", "X2", "Y2", "Coil_position_2_L", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1_L", "Crash_stop_profile_2_S", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('m11', 'M11 P', '["Epoxy_length_1_L", "Epoxy_length_2_S", "Fantail_profile_1", "Fantail_profile_2", "Fantail_profile_3", "Fantail_profile_4", "Fantail_profile_5", {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('comet', 'ComET', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('marlin10d', 'Marlin 10D', '["X1_Center", "X1", "Y1", "Coil_position_1_S", "X2", "Y2", "Coil_position_2_L", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1_L", "Crash_stop_profile_2_S", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('rosewood1d', 'Rosewood 1D', '["Coil_inner_profile_1", "Coil_inner_profile_u", "Coil_inner_profile_v", "Coil_inner_profile_w", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", "Crash_stop_profile_3", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('rosewood2d', 'Rosewood 2D', '["Coil_inner_profile_1", "Coil_inner_profile_2", "Coil_inner_profile_UV", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", "Crash_stop_profile_3", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('skybolt1d', 'Skybolt 1D', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", "Coil_symmetry", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('skybolt2d', 'Skybolt 2D', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", "Coil_symmetry", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('skybolt3d', 'Skybolt 3D', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", "Coil_symmetry", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('skybolt4d', 'Skybolt 4D', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", "Coil_symmetry", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('summit10d', 'Summit 10D', '["X1", "Y1", "Bobbin_hole_true", "X2", "Y2", "Bobbin_slote_true", "X3", "Y3", "Coil_position_1", "X4", "Y4", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", "Crash_stop_profile_2", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}, {"id":"Bobbin_parallel","n":7}, {"id":"Bobbin_recess_DTM","n":6}, {"id":"Bobbin_recess_NDTM","n":6}]'),
('v111d', 'V11 1D', '["Coil_position_1", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('v112d', 'V11 2D', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('v114d', 'V11 4D', '["X1", "Y1", "Coil_position_1", "X2", "Y2", "Coil_position_2", "Epoxy_length_1_S", "Epoxy_length_2_L", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]'),
('v15cmr4d', 'V15 CMR 4D', '["X1", "Y1", "X2", "Y2", "Coil_position_1", "Coil_position_2", "Epoxy_length_1", "Epoxy_length_2", "Crash_stop_profile_1", {"id":"Coil_parallel","n":7}, {"id":"Coil_recess_DTM","n":6}, {"id":"Coil_recess_NDTM","n":6}]');

-- DISPENSING PRODUCTS
INSERT IGNORE INTO dispensing_product (product_name) VALUES
('Cimarron BP 3D'), ('Cimarron BP 4D'), ('Cimarron BP 5D'),
('Cimarron BP 3D Inch'), ('Cimarron BP 4D Inch'), ('Cimarron BP 5D Inch'),
('ComET'), ('ComET MM'),
('Dorado 5D'), ('Dorado 5D AL BB'), ('Dorado 5D Inch'), ('Dorado 5D NOAR'),
('Dorado 10D'), ('Dorado 10D_NOAR'), ('DR 10D'), ('DR 10D NOAR'), ('DR 10D NOAR-AAD'),
('M11 P'),
('Marlin 10D'),
('Rosewood 1D'), ('Rosewood 2D'),
('Skybolt 1D'), ('Skybolt 2D'), ('Skybolt 3D'), ('Skybolt 4D'),
('Summit 10D'),
('V11 1D'), ('V11 2D'), ('V11 4D'),
('V15 CMR 4D');

-- LASER PRODUCTS
INSERT IGNORE INTO laser_product (product_name) VALUES
('E-block Cimarron BP 3D'), ('Bobbin Cimarron BP 3D'),
('E-block Cimarron BP 4D'), ('Bobbin Cimarron BP 4D'),
('E-block Cimarron BP 5D'), ('Bobbin Cimarron BP 5D'),
('E-block Dorado 5D'), ('Bobbin Dorado 5D'),
('E-block Dorado 5D AL BB'), ('Bobbin Dorado 5D AL BB'),
('E-block Dorado 10D'), ('Bobbin Dorado 10D'),
('E-block Marlin 10D'), ('Bobbin Marlin 10D'),
('E-block Skybolt 1D'), ('Bobbin Skybolt 1D'),
('E-block Skybolt 2D'), ('Bobbin Skybolt 2D'),
('E-block Skybolt 3D'), ('Bobbin Skybolt 3D'),
('E-block Skybolt 4D'), ('Bobbin Skybolt 4D'),
('E-block Summit 10D'), ('Bobbin Summit 10D'),
('E-block V11 4D'), ('Bobbin V11 4D'),
('E-block V15 CMR 4D'), ('Bobbin V15 CMR 4D'),
('Dorado 5D AL BB'), ('Bobbin MR 10D');

-- POF PRODUCTS
INSERT IGNORE INTO pof_product (product_name) VALUES
('Cimarron BP 3D'), ('Cimarron BP 4D'), ('Cimarron BP 5D'),
('ComET'),
('Dorado 5D'), ('Dorado 5D AL BB'), ('Dorado 5D NOAR'),
('Dorado 10D'), ('Dorado 10D_NOAR'), ('DR 10D'), ('DR 10D NOAR'), ('DR 10D NOAR-AAD'),
('M11 P'),
('Marlin 10D'),
('Rosewood 1D'), ('Rosewood 2D'),
('Skybolt 1D'), ('Skybolt 2D'), ('Skybolt 3D'), ('Skybolt 4D'),
('Summit 10D'),
('V11 1D'), ('V11 2D'), ('V11 4D'),
('V15 CMR 4D');

-- DAMPER PRODUCTS
INSERT IGNORE INTO damper_product (product_name) VALUES
('Cimarron BP 3D'), ('Cimarron BP 4D'), ('Cimarron BP 5D'),
('Dorado 5D'), ('Dorado 5D AL BB'), ('Dorado 5D NOAR'),
('Dorado 10D'), ('Dorado 10D_NOAR'), ('DR 10D'), ('DR 10D NOAR'), ('DR 10D NOAR-AAD'),
('Marlin 10D'),
('Skybolt 1D'), ('Skybolt 2D'), ('Skybolt 3D'), ('Skybolt 4D'),
('Summit 10D'),
('V11 4D'),
('V15 CMR 4D'),
('Cimarron BR 3D');

USE belton_ipqc;
-- =========================================================================
-- INITIAL DATA: SPC CONFIGURATION LIMITS (Dispensing)
-- =========================================================================
INSERT INTO spc_config_limits (process_mode, product_key, dimension_name, lsl, lcl, cl, ucl, usl) VALUES
-- ==========================================
-- MODE: BUYOFF
-- ==========================================
-- cmr3d
('buyoff', 'cmr3d', 'Coil_outer_profile_u', 0.9500, NULL, 0.9570, NULL, 0.9650),
('buyoff', 'cmr3d', 'Coil_outer_profile_v', 0.9500, NULL, 0.9570, NULL, 0.9650),
('buyoff', 'cmr3d', 'Coil_outer_profile_w', 0.9500, NULL, 0.9570, NULL, 0.9650),
('buyoff', 'cmr3d', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'cmr3d', 'Epoxy_length_2', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'cmr3d', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('buyoff', 'cmr3d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'cmr3d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'cmr3d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- cmr4d
('buyoff', 'cmr4d', 'X1', 0.5625, NULL, 0.5700, NULL, 0.5775),
('buyoff', 'cmr4d', 'Y1', -0.0075, NULL, 0.0000, NULL, 0.0075),
('buyoff', 'cmr4d', 'X2', 0.9125, NULL, 0.9200, NULL, 0.9275),
('buyoff', 'cmr4d', 'Y2', -0.0075, NULL, 0.0000, NULL, 0.0075),
('buyoff', 'cmr4d', 'Coil_outer_profile_u', 1.1725, NULL, 1.1820, NULL, 1.1915),
('buyoff', 'cmr4d', 'Coil_outer_profile_v', 1.1725, NULL, 1.1820, NULL, 1.1915),
('buyoff', 'cmr4d', 'Coil_outer_profile_w', 1.1725, NULL, 1.1820, NULL, 1.1915),
('buyoff', 'cmr4d', 'Bobbin_position_1', 0.0000, NULL, NULL, NULL, 0.0150),
('buyoff', 'cmr4d', 'Bobbin_position_2', 0.0000, NULL, NULL, NULL, 0.0150),
('buyoff', 'cmr4d', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'cmr4d', 'Epoxy_length_2', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'cmr4d', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('buyoff', 'cmr4d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'cmr4d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'cmr4d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'cmr4d', 'Bobbin_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'cmr4d', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'cmr4d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- cmr5d
('buyoff', 'cmr5d', 'X1', 0.5625, NULL, 0.5700, NULL, 0.5775),
('buyoff', 'cmr5d', 'Y1', -0.0075, NULL, 0.0000, NULL, 0.0075),
('buyoff', 'cmr5d', 'X2', 0.9125, NULL, 0.9200, NULL, 0.9275),
('buyoff', 'cmr5d', 'Y2', -0.0075, NULL, 0.0000, NULL, 0.0075),
('buyoff', 'cmr5d', 'Coil_outer_profile_u', 1.1925, NULL, 1.2020, NULL, 1.2115),
('buyoff', 'cmr5d', 'Coil_outer_profile_v', 1.1925, NULL, 1.2020, NULL, 1.2115),
('buyoff', 'cmr5d', 'Coil_outer_profile_w', 1.1925, NULL, 1.2020, NULL, 1.2115),
('buyoff', 'cmr5d', 'Bobbin_position_1', 0.0000, NULL, NULL, NULL, 0.0150),
('buyoff', 'cmr5d', 'Bobbin_position_2', 0.0000, NULL, NULL, NULL, 0.0150),
('buyoff', 'cmr5d', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'cmr5d', 'Epoxy_length_2', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'cmr5d', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('buyoff', 'cmr5d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'cmr5d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'cmr5d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'cmr5d', 'Bobbin_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'cmr5d', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'cmr5d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- comet
('buyoff', 'comet', 'X1', 20.9562, NULL, 21.0340, NULL, 21.2118),
('buyoff', 'comet', 'Y1', 7.3832, NULL, 7.5610, NULL, 7.7388),
('buyoff', 'comet', 'X2', 20.9562, NULL, 21.0340, NULL, 21.2118),
('buyoff', 'comet', 'Y2', 7.3832, NULL, 7.5610, NULL, 7.7388),
('buyoff', 'comet', 'Coil_position_1', 0.0000, NULL, NULL, 0.2845, 0.3556),
('buyoff', 'comet', 'Coil_position_2', 0.0000, NULL, NULL, 0.2845, 0.3556),
('buyoff', 'comet', 'Epoxy_length_1', -1.2700, NULL, 0.0000, NULL, 1.2700),
('buyoff', 'comet', 'Epoxy_length_2', -1.2700, NULL, 0.0000, NULL, 1.2700),
('buyoff', 'comet', 'Crash_stop_profile_1', -0.0600, -0.0300, 0.0000, 0.0300, 0.0600),
('buyoff', 'comet', 'Coil_parallel', NULL, NULL, NULL, NULL, 0.1520),
('buyoff', 'comet', 'Coil_recess_DTM', NULL, NULL, NULL, NULL, 0.2500),
('buyoff', 'comet', 'Coil_recess_NDTM', NULL, NULL, NULL, NULL, 0.2500),

-- dorado5d
('buyoff', 'dorado5d', 'X1', 0.7640, 0.7650, 0.7690, 0.7730, 0.7740),
('buyoff', 'dorado5d', 'Y1', 0.2270, 0.2280, 0.2320, 0.2360, 0.2370),
('buyoff', 'dorado5d', 'X2', 0.7640, 0.7650, 0.7690, 0.7730, 0.7740),
('buyoff', 'dorado5d', 'Y2', 0.2270, 0.2280, 0.2320, 0.2360, 0.2370),
('buyoff', 'dorado5d', 'Coil_position_1_S', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('buyoff', 'dorado5d', 'Coil_position_2_L', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('buyoff', 'dorado5d', 'Epoxy_length_1_S', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'dorado5d', 'Epoxy_length_2_L', 0.9000, NULL, NULL, NULL, 0.9750),
('buyoff', 'dorado5d', 'Crash_stop_profile_1_L', 0.3775, 0.3780, 0.3800, 0.3820, 0.3825),
('buyoff', 'dorado5d', 'Crash_stop_profile_2_S', -0.0025, -0.0020, 0.0000, 0.0020, 0.0025),
('buyoff', 'dorado5d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'dorado5d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'dorado5d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'dorado5d', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'dorado5d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- dorado10d
('buyoff', 'dorado10d', 'X1_Center', 0.6140, 0.6150, 0.6200, 0.6250, 0.6260),
('buyoff', 'dorado10d', 'X1', 0.8780, 0.8790, 0.8830, 0.8870, 0.8880),
('buyoff', 'dorado10d', 'Y1', 0.2690, 0.2700, 0.2740, 0.2780, 0.2790),
('buyoff', 'dorado10d', 'X2', 0.8780, 0.8790, 0.8830, 0.8870, 0.8880),
('buyoff', 'dorado10d', 'Y2', 0.2690, 0.2700, 0.2740, 0.2780, 0.2790),
('buyoff', 'dorado10d', 'Coil_position_1_S', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('buyoff', 'dorado10d', 'Coil_position_2_L', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('buyoff', 'dorado10d', 'Epoxy_length_1_S', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'dorado10d', 'Epoxy_length_2_L', 0.9500, NULL, 0.9950, NULL, 1.0700),
('buyoff', 'dorado10d', 'Crash_stop_profile_1_L', 0.3775, 0.3780, 0.3800, 0.3820, 0.3825),
('buyoff', 'dorado10d', 'Crash_stop_profile_2_S', -0.0025, -0.0020, 0.0000, 0.0020, 0.0025),
('buyoff', 'dorado10d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'dorado10d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'dorado10d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'dorado10d', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'dorado10d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- marlin10d
('buyoff', 'marlin10d', 'X1_Center', 0.6550, NULL, 0.6600, NULL, 0.6650),
('buyoff', 'marlin10d', 'X1', 0.9150, NULL, 0.9220, NULL, 0.9290),
('buyoff', 'marlin10d', 'Y1', 0.2740, NULL, 0.2810, NULL, 0.2880),
('buyoff', 'marlin10d', 'X2', 0.9150, NULL, 0.9220, NULL, 0.9290),
('buyoff', 'marlin10d', 'Y2', 0.2740, NULL, 0.2810, NULL, 0.2880),
('buyoff', 'marlin10d', 'Coil_position_1_S', 0.0000, NULL, NULL, NULL, 0.0140),
('buyoff', 'marlin10d', 'Coil_position_2_L', 0.0000, NULL, NULL, NULL, 0.0140),
('buyoff', 'marlin10d', 'Epoxy_length_1_S', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'marlin10d', 'Epoxy_length_2_L', 0.0300, NULL, NULL, NULL, 0.1000),
('buyoff', 'marlin10d', 'Crash_stop_profile_1_L', 0.1345, NULL, 0.1375, NULL, 0.1395),
('buyoff', 'marlin10d', 'Crash_stop_profile_2_S', -0.0025, NULL, 0.0000, NULL, 0.0025),
('buyoff', 'marlin10d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'marlin10d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'marlin10d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'marlin10d', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'marlin10d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- m11
('buyoff', 'm11', 'Epoxy_length_1_L', 7.2100, NULL, NULL, NULL, 8.7100),
('buyoff', 'm11', 'Epoxy_length_2_S', 16.5000, NULL, NULL, NULL, 18.0000),
('buyoff', 'm11', 'Fantail_profile_1', 9.3300, NULL, NULL, NULL, 9.4300),
('buyoff', 'm11', 'Fantail_profile_2', 17.1000, NULL, NULL, NULL, 17.2000),
('buyoff', 'm11', 'Fantail_profile_3', 0.9600, NULL, NULL, NULL, 1.1200),
('buyoff', 'm11', 'Fantail_profile_4', 17.9200, NULL, NULL, NULL, 18.0800),
('buyoff', 'm11', 'Fantail_profile_5', 4.3100, NULL, NULL, NULL, 4.4100),
('buyoff', 'm11', 'Coil_recess_DTM', NULL, NULL, NULL, NULL, 0.3800),
('buyoff', 'm11', 'Coil_recess_NDTM', NULL, NULL, NULL, NULL, 0.3800),

-- rosewood1d
('buyoff', 'rosewood1d', 'Coil_inner_profile_1', 0.8900, NULL, 1.0700, NULL, 1.2500),
('buyoff', 'rosewood1d', 'Coil_inner_profile_u', 16.2200, NULL, 16.4000, NULL, 16.5800),
('buyoff', 'rosewood1d', 'Coil_inner_profile_v', 16.2200, NULL, 16.4000, NULL, 16.5800),
('buyoff', 'rosewood1d', 'Coil_inner_profile_w', 16.2200, NULL, 16.4000, NULL, 16.5800),
('buyoff', 'rosewood1d', 'Epoxy_length_1', 10.9760, NULL, 11.3560, NULL, 12.2560),
('buyoff', 'rosewood1d', 'Epoxy_length_2', 14.0730, NULL, 14.4530, NULL, 15.3530),
('buyoff', 'rosewood1d', 'Crash_stop_profile_1', 8.7090, NULL, 8.7710, NULL, 8.8340),
('buyoff', 'rosewood1d', 'Crash_stop_profile_2', 0.9540, NULL, 1.0160, NULL, 1.0790),
('buyoff', 'rosewood1d', 'Crash_stop_profile_3', 16.8930, NULL, 16.9550, NULL, 17.0180),
('buyoff', 'rosewood1d', 'Coil_parallel', NULL, NULL, 0.0000, NULL, 0.1200),
('buyoff', 'rosewood1d', 'Coil_recess_DTM', NULL, NULL, 0.0000, NULL, 0.2500),
('buyoff', 'rosewood1d', 'Coil_recess_NDTM', NULL, NULL, 0.0000, NULL, 0.2500),

-- rosewood2d
('buyoff', 'rosewood2d', 'Coil_inner_profile_1', -0.1600, NULL, 0.0200, NULL, 0.2000),
('buyoff', 'rosewood2d', 'Coil_inner_profile_2', -0.1600, NULL, 0.0200, NULL, 0.2000),
('buyoff', 'rosewood2d', 'Coil_inner_profile_UV', 15.7480, NULL, 15.9280, NULL, 16.1080),
('buyoff', 'rosewood2d', 'Epoxy_length_1', 12.5690, NULL, 12.9490, NULL, 13.6990),
('buyoff', 'rosewood2d', 'Epoxy_length_2', 14.1700, NULL, 14.5500, NULL, 15.3000),
('buyoff', 'rosewood2d', 'Crash_stop_profile_1', 8.7090, NULL, 8.7710, NULL, 8.8340),
('buyoff', 'rosewood2d', 'Crash_stop_profile_2', 0.9540, NULL, 1.0160, NULL, 1.0790),
('buyoff', 'rosewood2d', 'Crash_stop_profile_3', 12.1490, NULL, 12.2110, NULL, 12.2740),
('buyoff', 'rosewood2d', 'Coil_parallel', NULL, NULL, 0.0000, NULL, 0.1200),
('buyoff', 'rosewood2d', 'Coil_recess_DTM', NULL, NULL, 0.0000, NULL, 0.2500),
('buyoff', 'rosewood2d', 'Coil_recess_NDTM', NULL, NULL, 0.0000, NULL, 0.2500),
('buyoff', 'rosewood2d', 'Bobbin_recess_DTM', NULL, NULL, NULL, NULL, 0.2500),
('buyoff', 'rosewood2d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, NULL, 0.2500),

-- skybolt1d
('buyoff', 'skybolt1d', 'X1', 17.1500, NULL, 17.3400, NULL, 17.5300),
('buyoff', 'skybolt1d', 'Y1', 5.6600, NULL, 5.8500, NULL, 6.0400),
('buyoff', 'skybolt1d', 'X2', 17.1500, NULL, 17.3400, NULL, 17.5300),
('buyoff', 'skybolt1d', 'Y2', 5.6600, NULL, 5.8500, NULL, 6.0400),
('buyoff', 'skybolt1d', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'skybolt1d', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'skybolt1d', 'Epoxy_length_1', 14.3900, 14.5805, 15.6600, 16.7395, 16.9300),
('buyoff', 'skybolt1d', 'Epoxy_length_2', 14.3900, 14.5805, 15.6600, 16.7395, 16.9300),
('buyoff', 'skybolt1d', 'Crash_stop_profile_1', 6.5620, 6.5677, 6.6000, 6.6323, 6.6380),
('buyoff', 'skybolt1d', 'Crash_stop_profile_2', 6.5620, 6.5677, 6.6000, 6.6323, 6.6380),
('buyoff', 'skybolt1d', 'Coil_symmetry', 4.1500, 4.1650, 4.2500, 4.3350, 4.3500),
('buyoff', 'skybolt1d', 'Coil_parallel', 0.0000, NULL, NULL, NULL, 0.1500),
('buyoff', 'skybolt1d', 'Coil_recess_DTM', 0.0000, NULL, NULL, NULL, 0.2500),
('buyoff', 'skybolt1d', 'Coil_recess_NDTM', 0.0000, NULL, NULL, NULL, 0.2500),

-- skybolt2d
('buyoff', 'skybolt2d', 'X1', 16.9900, 17.0190, 17.1800, 17.3420, 17.3700),
('buyoff', 'skybolt2d', 'Y1', 5.5900, 5.6190, 5.7800, 5.9420, 5.9700),
('buyoff', 'skybolt2d', 'X2', 16.9900, 17.0190, 17.1800, 17.3420, 17.3700),
('buyoff', 'skybolt2d', 'Y2', 5.5900, 5.6190, 5.7800, 5.9420, 5.9700),
('buyoff', 'skybolt2d', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'skybolt2d', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'skybolt2d', 'Epoxy_length_1', 14.2800, 14.4710, 15.5500, 16.6300, 16.8200),
('buyoff', 'skybolt2d', 'Epoxy_length_2', 14.2300, 14.4210, 15.5000, 16.5800, 16.7700),
('buyoff', 'skybolt2d', 'Crash_stop_profile_1', 6.5620, 6.5680, 6.6000, 6.6320, 6.6380),
('buyoff', 'skybolt2d', 'Crash_stop_profile_2', 6.5620, 6.5680, 6.6000, 6.6320, 6.6380),
('buyoff', 'skybolt2d', 'Coil_symmetry', 4.9500, NULL, 5.0500, NULL, 5.1500),
('buyoff', 'skybolt2d', 'Coil_parallel', NULL, 0.0044, NULL, 0.0227, 0.1500),
('buyoff', 'skybolt2d', 'Coil_recess_DTM', NULL, 0.0542, NULL, 0.2138, 0.2500),
('buyoff', 'skybolt2d', 'Coil_recess_NDTM', NULL, 0.0533, NULL, 0.1665, 0.2500),

-- skybolt3d
('buyoff', 'skybolt3d', 'X1', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('buyoff', 'skybolt3d', 'Y1', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('buyoff', 'skybolt3d', 'X2', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('buyoff', 'skybolt3d', 'Y2', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('buyoff', 'skybolt3d', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'skybolt3d', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'skybolt3d', 'Epoxy_length_1', 13.9900, 14.1805, 15.2600, 16.3395, 16.5300),
('buyoff', 'skybolt3d', 'Epoxy_length_2', 14.2900, 14.4805, 15.5600, 16.6395, 16.8300),
('buyoff', 'skybolt3d', 'Crash_stop_profile_1', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('buyoff', 'skybolt3d', 'Crash_stop_profile_2', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('buyoff', 'skybolt3d', 'Coil_symmetry', 4.9100, 4.9250, 5.0100, 5.0950, 5.1100),
('buyoff', 'skybolt3d', 'Coil_parallel', NULL, 0.0041, NULL, 0.0114, 0.1500),
('buyoff', 'skybolt3d', 'Coil_recess_DTM', NULL, 0.0715, NULL, 0.1635, 0.2500),
('buyoff', 'skybolt3d', 'Coil_recess_NDTM', NULL, 0.0712, NULL, 0.2042, 0.2500),

-- skybolt4d
('buyoff', 'skybolt4d', 'X1', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('buyoff', 'skybolt4d', 'Y1', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('buyoff', 'skybolt4d', 'X2', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('buyoff', 'skybolt4d', 'Y2', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('buyoff', 'skybolt4d', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'skybolt4d', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('buyoff', 'skybolt4d', 'Epoxy_length_1', 13.9900, 14.1810, 15.2600, 16.3400, 16.5300),
('buyoff', 'skybolt4d', 'Epoxy_length_2', 14.2900, 14.4810, 15.5600, 16.6400, 16.8300),
('buyoff', 'skybolt4d', 'Crash_stop_profile_1', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('buyoff', 'skybolt4d', 'Crash_stop_profile_2', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('buyoff', 'skybolt4d', 'Coil_symmetry', 4.9100, 4.9250, 5.0100, 5.0950, 5.1100),
('buyoff', 'skybolt4d', 'Coil_parallel', NULL, 0.0090, NULL, 0.0313, 0.1500),
('buyoff', 'skybolt4d', 'Coil_recess_DTM', NULL, 0.0940, NULL, 0.2220, 0.2500),
('buyoff', 'skybolt4d', 'Coil_recess_NDTM', NULL, 0.1102, NULL, 0.2312, 0.2500),

-- summit10d
('buyoff', 'summit10d', 'X1', 0.6125, NULL, 0.6200, NULL, 0.6275),
('buyoff', 'summit10d', 'Y1', -0.0075, NULL, 0.0000, NULL, 0.0075),
('buyoff', 'summit10d', 'X2', 0.8725, NULL, 0.8800, NULL, 0.8875),
('buyoff', 'summit10d', 'Y2', -0.0075, NULL, 0.0000, NULL, 0.0075),
('buyoff', 'summit10d', 'X3', 0.9150, NULL, 0.9220, NULL, 0.9290),
('buyoff', 'summit10d', 'Y3', 0.2740, NULL, 0.2810, NULL, 0.2880),
('buyoff', 'summit10d', 'X4', 0.9150, NULL, 0.9220, NULL, 0.9290),
('buyoff', 'summit10d', 'Y4', 0.2740, NULL, 0.2810, NULL, 0.2880),
('buyoff', 'summit10d', 'Bobbin_hole_true', 0.0000, NULL, 0.0000, NULL, 0.0150),
('buyoff', 'summit10d', 'Bobbin_slote_true', 0.0000, NULL, 0.0000, NULL, 0.0150),
('buyoff', 'summit10d', 'Coil_position_1', 0.0000, NULL, NULL, NULL, 0.0140),
('buyoff', 'summit10d', 'Coil_position_2', 0.0000, NULL, NULL, NULL, 0.0140),
('buyoff', 'summit10d', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('buyoff', 'summit10d', 'Epoxy_length_2', 0.0300, NULL, NULL, NULL, 0.1000),
('buyoff', 'summit10d', 'Crash_stop_profile_1', 0.1345, NULL, 0.1370, NULL, 0.1395),
('buyoff', 'summit10d', 'Crash_stop_profile_2', -0.0025, NULL, 0.0000, NULL, 0.0025),
('buyoff', 'summit10d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'summit10d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'summit10d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'summit10d', 'Bobbin_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'summit10d', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'summit10d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v111d
('buyoff', 'v111d', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'v111d', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'v111d', 'Epoxy_length_1', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'v111d', 'Epoxy_length_2', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'v111d', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('buyoff', 'v111d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'v111d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'v111d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v112d
('buyoff', 'v112d', 'X1', 0.8210, NULL, 0.8340, NULL, 0.8350),
('buyoff', 'v112d', 'Y1', 0.2910, NULL, 0.3040, NULL, 0.3050),
('buyoff', 'v112d', 'X2', 0.8210, NULL, 0.8340, NULL, 0.8350),
('buyoff', 'v112d', 'Y2', 0.2910, NULL, 0.3040, NULL, 0.3050),
('buyoff', 'v112d', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'v112d', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'v112d', 'Epoxy_length_1_S', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'v112d', 'Epoxy_length_2_L', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'v112d', 'Crash_stop_profile_1', -0.0025, -0.0018, 0.0000, 0.0018, 0.0025),
('buyoff', 'v112d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'v112d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'v112d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v114d
('buyoff', 'v114d', 'X1', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('buyoff', 'v114d', 'Y1', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('buyoff', 'v114d', 'X2', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('buyoff', 'v114d', 'Y2', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('buyoff', 'v114d', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'v114d', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'v114d', 'Epoxy_length_1_S', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'v114d', 'Epoxy_length_2_L', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'v114d', 'Crash_stop_profile_1', -0.0025, -0.0018, 0.0000, 0.0018, 0.0025),
('buyoff', 'v114d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'v114d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'v114d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v15cmr4d
('buyoff', 'v15cmr4d', 'X1', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('buyoff', 'v15cmr4d', 'Y1', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('buyoff', 'v15cmr4d', 'X2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'v15cmr4d', 'Y2', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('buyoff', 'v15cmr4d', 'Coil_position_1', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('buyoff', 'v15cmr4d', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('buyoff', 'v15cmr4d', 'Epoxy_length_1', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'v15cmr4d', 'Epoxy_length_2', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('buyoff', 'v15cmr4d', 'Crash_stop_profile_1', -0.0025, -0.0018, 0.0000, 0.0018, 0.0025),
('buyoff', 'v15cmr4d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('buyoff', 'v15cmr4d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('buyoff', 'v15cmr4d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- ==========================================
-- MODE: ROVING
-- ==========================================
-- cmr3d
('roving', 'cmr3d', 'Coil_outer_profile_u', 0.9500, NULL, 0.9570, NULL, 0.9650),
('roving', 'cmr3d', 'Coil_outer_profile_v', 0.9500, NULL, 0.9570, NULL, 0.9650),
('roving', 'cmr3d', 'Coil_outer_profile_w', 0.9500, NULL, 0.9570, NULL, 0.9650),
('roving', 'cmr3d', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'cmr3d', 'Epoxy_length_2', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'cmr3d', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('roving', 'cmr3d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'cmr3d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'cmr3d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- cmr4d
('roving', 'cmr4d', 'X1', 0.5625, NULL, 0.5700, NULL, 0.5775),
('roving', 'cmr4d', 'Y1', -0.0075, NULL, 0.0000, NULL, 0.0075),
('roving', 'cmr4d', 'X2', 0.9125, NULL, 0.9200, NULL, 0.9275),
('roving', 'cmr4d', 'Y2', -0.0075, NULL, 0.0000, NULL, 0.0075),
('roving', 'cmr4d', 'Coil_outer_profile_u', 1.1725, NULL, 1.1820, NULL, 1.1915),
('roving', 'cmr4d', 'Coil_outer_profile_v', 1.1725, NULL, 1.1820, NULL, 1.1915),
('roving', 'cmr4d', 'Coil_outer_profile_w', 1.1725, NULL, 1.1820, NULL, 1.1915),
('roving', 'cmr4d', 'Bobbin_position_1', 0.0000, NULL, NULL, NULL, 0.0150),
('roving', 'cmr4d', 'Bobbin_position_2', 0.0000, NULL, NULL, NULL, 0.0150),
('roving', 'cmr4d', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'cmr4d', 'Epoxy_length_2', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'cmr4d', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('roving', 'cmr4d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'cmr4d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'cmr4d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'cmr4d', 'Bobbin_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'cmr4d', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'cmr4d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- cmr5d
('roving', 'cmr5d', 'X1', 0.5625, NULL, 0.5700, NULL, 0.5775),
('roving', 'cmr5d', 'Y1', -0.0075, NULL, 0.0000, NULL, 0.0075),
('roving', 'cmr5d', 'X2', 0.9125, NULL, 0.9200, NULL, 0.9275),
('roving', 'cmr5d', 'Y2', -0.0075, NULL, 0.0000, NULL, 0.0075),
('roving', 'cmr5d', 'Coil_outer_profile_u', 1.1925, NULL, 1.2020, NULL, 1.2115),
('roving', 'cmr5d', 'Coil_outer_profile_v', 1.1925, NULL, 1.2020, NULL, 1.2115),
('roving', 'cmr5d', 'Coil_outer_profile_w', 1.1925, NULL, 1.2020, NULL, 1.2115),
('roving', 'cmr5d', 'Bobbin_position_1', 0.0000, NULL, NULL, NULL, 0.0150),
('roving', 'cmr5d', 'Bobbin_position_2', 0.0000, NULL, NULL, NULL, 0.0150),
('roving', 'cmr5d', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'cmr5d', 'Epoxy_length_2', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'cmr5d', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('roving', 'cmr5d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'cmr5d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'cmr5d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'cmr5d', 'Bobbin_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'cmr5d', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'cmr5d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- comet
('roving', 'comet', 'X1', 20.9562, NULL, 21.0340, NULL, 21.2118),
('roving', 'comet', 'Y1', 7.3832, NULL, 7.5610, NULL, 7.7388),
('roving', 'comet', 'X2', 20.9562, NULL, 21.0340, NULL, 21.2118),
('roving', 'comet', 'Y2', 7.3832, NULL, 7.5610, NULL, 7.7388),
('roving', 'comet', 'Coil_position_1', 0.0000, NULL, NULL, 0.2845, 0.3556),
('roving', 'comet', 'Coil_position_2', 0.0000, NULL, NULL, 0.2845, 0.3556),
('roving', 'comet', 'Epoxy_length_1', -1.2700, NULL, 0.0000, NULL, 1.2700),
('roving', 'comet', 'Epoxy_length_2', -1.2700, NULL, 0.0000, NULL, 1.2700),
('roving', 'comet', 'Crash_stop_profile_1', -0.0600, -0.0300, 0.0000, 0.0300, 0.0600),
('roving', 'comet', 'Coil_parallel', NULL, NULL, NULL, NULL, 0.1520),
('roving', 'comet', 'Coil_recess_DTM', NULL, NULL, NULL, NULL, 0.2500),
('roving', 'comet', 'Coil_recess_NDTM', NULL, NULL, NULL, NULL, 0.2500),

-- dorado10d
('roving', 'dorado10d', 'X1_Center', 0.6140, 0.6150, 0.6200, 0.6250, 0.6260),
('roving', 'dorado10d', 'X1', 0.8780, 0.8790, 0.8830, 0.8870, 0.8880),
('roving', 'dorado10d', 'Y1', 0.2690, 0.2700, 0.2740, 0.2780, 0.2790),
('roving', 'dorado10d', 'X2', 0.8780, 0.8790, 0.8830, 0.8870, 0.8880),
('roving', 'dorado10d', 'Y2', 0.2690, 0.2700, 0.2740, 0.2780, 0.2790),
('roving', 'dorado10d', 'Coil_position_1_S', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('roving', 'dorado10d', 'Coil_position_2_L', 0.0000, 0.0010, NULL, 0.0130, 0.0140),
('roving', 'dorado10d', 'Epoxy_length_1_S', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'dorado10d', 'Epoxy_length_2_L', 0.9500, NULL, 0.9950, NULL, 1.0700),
('roving', 'dorado10d', 'Crash_stop_profile_1_L', 0.3775, 0.3780, 0.3800, 0.3820, 0.3825),
('roving', 'dorado10d', 'Crash_stop_profile_2_S', -0.0025, -0.0020, 0.0000, 0.0020, 0.0025),
('roving', 'dorado10d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'dorado10d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'dorado10d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'dorado10d', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'dorado10d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- marlin10d
('roving', 'marlin10d', 'X1_Center', 0.6550, NULL, 0.6600, NULL, 0.6650),
('roving', 'marlin10d', 'X1', 0.9150, NULL, 0.9220, NULL, 0.9290),
('roving', 'marlin10d', 'Y1', 0.2740, NULL, 0.2810, NULL, 0.2880),
('roving', 'marlin10d', 'X2', 0.9150, NULL, 0.9220, NULL, 0.9290),
('roving', 'marlin10d', 'Y2', 0.2740, NULL, 0.2810, NULL, 0.2880),
('roving', 'marlin10d', 'Coil_position_1_S', 0.0000, NULL, NULL, NULL, 0.0140),
('roving', 'marlin10d', 'Coil_position_2_L', 0.0000, NULL, NULL, NULL, 0.0140),
('roving', 'marlin10d', 'Epoxy_length_1_S', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'marlin10d', 'Epoxy_length_2_L', 0.0300, NULL, NULL, NULL, 0.1000),
('roving', 'marlin10d', 'Crash_stop_profile_1_L', 0.1345, NULL, 0.1375, NULL, 0.1395),
('roving', 'marlin10d', 'Crash_stop_profile_2_S', -0.0025, NULL, 0.0000, NULL, 0.0025),
('roving', 'marlin10d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'marlin10d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'marlin10d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'marlin10d', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'marlin10d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- m11
('roving', 'm11', 'Epoxy_length_1_L', 7.2100, NULL, NULL, NULL, 8.7100),
('roving', 'm11', 'Epoxy_length_2_S', 16.5000, NULL, NULL, NULL, 18.0000),
('roving', 'm11', 'Fantail_profile_1', 9.3300, NULL, NULL, NULL, 9.4300),
('roving', 'm11', 'Fantail_profile_2', 17.1000, NULL, NULL, NULL, 17.2000),
('roving', 'm11', 'Fantail_profile_3', 0.9600, NULL, NULL, NULL, 1.1200),
('roving', 'm11', 'Fantail_profile_4', 17.9200, NULL, NULL, NULL, 18.0800),
('roving', 'm11', 'Fantail_profile_5', 4.3100, NULL, NULL, NULL, 4.4100),
('roving', 'm11', 'Coil_recess_DTM', NULL, NULL, NULL, NULL, 0.3800),
('roving', 'm11', 'Coil_recess_NDTM', NULL, NULL, NULL, NULL, 0.3800),

-- rosewood1d
('roving', 'rosewood1d', 'Coil_inner_profile_1', 0.8900, NULL, 1.0700, NULL, 1.2500),
('roving', 'rosewood1d', 'Coil_inner_profile_u', 16.2200, NULL, 16.4000, NULL, 16.5800),
('roving', 'rosewood1d', 'Coil_inner_profile_v', 16.2200, NULL, 16.4000, NULL, 16.5800),
('roving', 'rosewood1d', 'Coil_inner_profile_w', 16.2200, NULL, 16.4000, NULL, 16.5800),
('roving', 'rosewood1d', 'Epoxy_length_1', 10.9760, NULL, 11.3560, NULL, 12.2560),
('roving', 'rosewood1d', 'Epoxy_length_2', 14.0730, NULL, 14.4530, NULL, 15.3530),
('roving', 'rosewood1d', 'Crash_stop_profile_1', 8.7090, NULL, 8.7710, NULL, 8.8340),
('roving', 'rosewood1d', 'Crash_stop_profile_2', 0.9540, NULL, 1.0160, NULL, 1.0790),
('roving', 'rosewood1d', 'Crash_stop_profile_3', 16.8930, NULL, 16.9550, NULL, 17.0180),
('roving', 'rosewood1d', 'Coil_parallel', NULL, NULL, 0.0000, NULL, 0.1200),
('roving', 'rosewood1d', 'Coil_recess_DTM', NULL, NULL, 0.0000, NULL, 0.2500),
('roving', 'rosewood1d', 'Coil_recess_NDTM', NULL, NULL, 0.0000, NULL, 0.2500),

-- rosewood2d
('roving', 'rosewood2d', 'Coil_inner_profile_1', -0.1600, NULL, 0.0200, NULL, 0.2000),
('roving', 'rosewood2d', 'Coil_inner_profile_2', -0.1600, NULL, 0.0200, NULL, 0.2000),
('roving', 'rosewood2d', 'Coil_inner_profile_UV', 15.7480, NULL, 15.9280, NULL, 16.1080),
('roving', 'rosewood2d', 'Epoxy_length_1', 12.5690, NULL, 12.9490, NULL, 13.6990),
('roving', 'rosewood2d', 'Epoxy_length_2', 14.1700, NULL, 14.5500, NULL, 15.3000),
('roving', 'rosewood2d', 'Crash_stop_profile_1', 8.7090, NULL, 8.7710, NULL, 8.8340),
('roving', 'rosewood2d', 'Crash_stop_profile_2', 0.9540, NULL, 1.0160, NULL, 1.0790),
('roving', 'rosewood2d', 'Crash_stop_profile_3', 12.1490, NULL, 12.2110, NULL, 12.2740),
('roving', 'rosewood2d', 'Coil_parallel', NULL, NULL, 0.0000, NULL, 0.1200),
('roving', 'rosewood2d', 'Coil_recess_DTM', NULL, NULL, 0.0000, NULL, 0.2500),
('roving', 'rosewood2d', 'Coil_recess_NDTM', NULL, NULL, 0.0000, NULL, 0.2500),
('roving', 'rosewood2d', 'Bobbin_recess_DTM', NULL, NULL, NULL, NULL, 0.2500),
('roving', 'rosewood2d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, NULL, 0.2500),

-- skybolt1d
('roving', 'skybolt1d', 'X1', 17.1500, NULL, 17.3400, NULL, 17.5300),
('roving', 'skybolt1d', 'Y1', 5.6600, NULL, 5.8500, NULL, 6.0400),
('roving', 'skybolt1d', 'X2', 17.1500, NULL, 17.3400, NULL, 17.5300),
('roving', 'skybolt1d', 'Y2', 5.6600, NULL, 5.8500, NULL, 6.0400),
('roving', 'skybolt1d', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'skybolt1d', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'skybolt1d', 'Epoxy_length_1', 14.3900, 14.5805, 15.6600, 16.7395, 16.9300),
('roving', 'skybolt1d', 'Epoxy_length_2', 14.3900, 14.5805, 15.6600, 16.7395, 16.9300),
('roving', 'skybolt1d', 'Crash_stop_profile_1', 6.5620, 6.5677, 6.6000, 6.6323, 6.6380),
('roving', 'skybolt1d', 'Crash_stop_profile_2', 6.5620, 6.5677, 6.6000, 6.6323, 6.6380),
('roving', 'skybolt1d', 'Coil_symmetry', 4.1500, 4.1650, 4.2500, 4.3350, 4.3500),
('roving', 'skybolt1d', 'Coil_parallel', 0.0000, NULL, NULL, NULL, 0.1500),
('roving', 'skybolt1d', 'Coil_recess_DTM', 0.0000, NULL, NULL, NULL, 0.2500),
('roving', 'skybolt1d', 'Coil_recess_NDTM', 0.0000, NULL, NULL, NULL, 0.2500),

-- skybolt2d
('roving', 'skybolt2d', 'X1', 16.9900, 17.0190, 17.1800, 17.3420, 17.3700),
('roving', 'skybolt2d', 'Y1', 5.5900, 5.6190, 5.7800, 5.9420, 5.9700),
('roving', 'skybolt2d', 'X2', 16.9900, 17.0190, 17.1800, 17.3420, 17.3700),
('roving', 'skybolt2d', 'Y2', 5.5900, 5.6190, 5.7800, 5.9420, 5.9700),
('roving', 'skybolt2d', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'skybolt2d', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'skybolt2d', 'Epoxy_length_1', 14.2800, 14.4710, 15.5500, 16.6300, 16.8200),
('roving', 'skybolt2d', 'Epoxy_length_2', 14.2300, 14.4210, 15.5000, 16.5800, 16.7700),
('roving', 'skybolt2d', 'Crash_stop_profile_1', 6.5620, 6.5680, 6.6000, 6.6320, 6.6380),
('roving', 'skybolt2d', 'Crash_stop_profile_2', 6.5620, 6.5680, 6.6000, 6.6320, 6.6380),
('roving', 'skybolt2d', 'Coil_symmetry', 4.9500, NULL, 5.0500, NULL, 5.1500),
('roving', 'skybolt2d', 'Coil_parallel', NULL, 0.0044, NULL, 0.0227, 0.1500),
('roving', 'skybolt2d', 'Coil_recess_DTM', NULL, 0.0542, NULL, 0.2138, 0.2500),
('roving', 'skybolt2d', 'Coil_recess_NDTM', NULL, 0.0533, NULL, 0.1665, 0.2500),

-- skybolt3d
('roving', 'skybolt3d', 'X1', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('roving', 'skybolt3d', 'Y1', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('roving', 'skybolt3d', 'X2', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('roving', 'skybolt3d', 'Y2', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('roving', 'skybolt3d', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'skybolt3d', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'skybolt3d', 'Epoxy_length_1', 13.9900, 14.1805, 15.2600, 16.3395, 16.5300),
('roving', 'skybolt3d', 'Epoxy_length_2', 14.2900, 14.4805, 15.5600, 16.6395, 16.8300),
('roving', 'skybolt3d', 'Crash_stop_profile_1', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('roving', 'skybolt3d', 'Crash_stop_profile_2', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('roving', 'skybolt3d', 'Coil_symmetry', 4.9100, 4.9250, 5.0100, 5.0950, 5.1100),
('roving', 'skybolt3d', 'Coil_parallel', NULL, 0.0041, NULL, 0.0114, 0.1500),
('roving', 'skybolt3d', 'Coil_recess_DTM', NULL, 0.0715, NULL, 0.1635, 0.2500),
('roving', 'skybolt3d', 'Coil_recess_NDTM', NULL, 0.0712, NULL, 0.2042, 0.2500),

-- skybolt4d
('roving', 'skybolt4d', 'X1', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('roving', 'skybolt4d', 'Y1', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('roving', 'skybolt4d', 'X2', 16.3700, 16.3985, 16.5600, 16.7215, 16.7500),
('roving', 'skybolt4d', 'Y2', 4.4900, 4.5185, 4.6800, 4.8415, 4.8700),
('roving', 'skybolt4d', 'Coil_position_1', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'skybolt4d', 'Coil_position_2', 0.0000, NULL, NULL, 0.2660, 0.3800),
('roving', 'skybolt4d', 'Epoxy_length_1', 13.9900, 14.1810, 15.2600, 16.3400, 16.5300),
('roving', 'skybolt4d', 'Epoxy_length_2', 14.2900, 14.4810, 15.5600, 16.6400, 16.8300),
('roving', 'skybolt4d', 'Crash_stop_profile_1', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('roving', 'skybolt4d', 'Crash_stop_profile_2', 7.6620, 7.6677, 7.7000, 7.7323, 7.7380),
('roving', 'skybolt4d', 'Coil_symmetry', 4.9100, 4.9250, 5.0100, 5.0950, 5.1100),
('roving', 'skybolt4d', 'Coil_parallel', NULL, 0.0090, NULL, 0.0313, 0.1500),
('roving', 'skybolt4d', 'Coil_recess_DTM', NULL, 0.0940, NULL, 0.2220, 0.2500),
('roving', 'skybolt4d', 'Coil_recess_NDTM', NULL, 0.1102, NULL, 0.2312, 0.2500),

-- summit10d
('roving', 'summit10d', 'X1', 0.6125, NULL, 0.6200, NULL, 0.6275),
('roving', 'summit10d', 'Y1', -0.0075, NULL, 0.0000, NULL, 0.0075),
('roving', 'summit10d', 'X2', 0.8725, NULL, 0.8800, NULL, 0.8875),
('roving', 'summit10d', 'Y2', -0.0075, NULL, 0.0000, NULL, 0.0075),
('roving', 'summit10d', 'X3', 0.9150, NULL, 0.9220, NULL, 0.9290),
('roving', 'summit10d', 'Y3', 0.2740, NULL, 0.2810, NULL, 0.2880),
('roving', 'summit10d', 'X4', 0.9150, NULL, 0.9220, NULL, 0.9290),
('roving', 'summit10d', 'Y4', 0.2740, NULL, 0.2810, NULL, 0.2880),
('roving', 'summit10d', 'Bobbin_hole_true', 0.0000, NULL, 0.0000, NULL, 0.0150),
('roving', 'summit10d', 'Bobbin_slote_true', 0.0000, NULL, 0.0000, NULL, 0.0150),
('roving', 'summit10d', 'Coil_position_1', 0.0000, NULL, NULL, NULL, 0.0140),
('roving', 'summit10d', 'Coil_position_2', 0.0000, NULL, NULL, NULL, 0.0140),
('roving', 'summit10d', 'Epoxy_length_1', -0.0500, NULL, 0.0000, NULL, 0.0500),
('roving', 'summit10d', 'Epoxy_length_2', 0.0300, NULL, NULL, NULL, 0.1000),
('roving', 'summit10d', 'Crash_stop_profile_1', 0.1345, NULL, 0.1370, NULL, 0.1395),
('roving', 'summit10d', 'Crash_stop_profile_2', -0.0025, NULL, 0.0000, NULL, 0.0025),
('roving', 'summit10d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'summit10d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'summit10d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'summit10d', 'Bobbin_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'summit10d', 'Bobbin_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'summit10d', 'Bobbin_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v111d
('roving', 'v111d', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'v111d', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'v111d', 'Epoxy_length_1', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'v111d', 'Epoxy_length_2', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'v111d', 'Crash_stop_profile_1', -0.0025, NULL, 0.0000, NULL, 0.0025),
('roving', 'v111d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'v111d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'v111d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v112d
('roving', 'v112d', 'X1', 0.8210, NULL, 0.8340, NULL, 0.8350),
('roving', 'v112d', 'Y1', 0.2910, NULL, 0.3040, NULL, 0.3050),
('roving', 'v112d', 'X2', 0.8210, NULL, 0.8340, NULL, 0.8350),
('roving', 'v112d', 'Y2', 0.2910, NULL, 0.3040, NULL, 0.3050),
('roving', 'v112d', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'v112d', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'v112d', 'Epoxy_length_1_S', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'v112d', 'Epoxy_length_2_L', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'v112d', 'Crash_stop_profile_1', -0.0025, -0.0018, 0.0000, 0.0018, 0.0025),
('roving', 'v112d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'v112d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'v112d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v114d
('roving', 'v114d', 'X1', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('roving', 'v114d', 'Y1', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('roving', 'v114d', 'X2', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('roving', 'v114d', 'Y2', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('roving', 'v114d', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'v114d', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'v114d', 'Epoxy_length_1_S', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'v114d', 'Epoxy_length_2_L', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'v114d', 'Crash_stop_profile_1', -0.0025, -0.0018, 0.0000, 0.0018, 0.0025),
('roving', 'v114d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'v114d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'v114d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100),

-- v15cmr4d
('roving', 'v15cmr4d', 'X1', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('roving', 'v15cmr4d', 'Y1', 0.2910, 0.2921, 0.2980, 0.3040, 0.3050),
('roving', 'v15cmr4d', 'X2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'v15cmr4d', 'Y2', 0.8210, 0.8221, 0.8280, 0.8340, 0.8350),
('roving', 'v15cmr4d', 'Coil_position_1', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'v15cmr4d', 'Coil_position_2', 0.0000, NULL, NULL, 0.0112, 0.0140),
('roving', 'v15cmr4d', 'Epoxy_length_1', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'v15cmr4d', 'Epoxy_length_2', -0.0500, -0.0250, 0.0000, 0.0250, 0.0500),
('roving', 'v15cmr4d', 'Crash_stop_profile_1', -0.0025, -0.0018, 0.0000, 0.0018, 0.0025),
('roving', 'v15cmr4d', 'Coil_parallel', NULL, NULL, NULL, 0.0040, 0.0060),
('roving', 'v15cmr4d', 'Coil_recess_DTM', NULL, NULL, NULL, 0.0090, 0.0100),
('roving', 'v15cmr4d', 'Coil_recess_NDTM', NULL, NULL, NULL, 0.0090, 0.0100);

-- =========================================================================
-- INITIAL DATA: SPC CONFIGURATION LIMITS (Laser, POF, Damper)
-- =========================================================================
INSERT IGNORE INTO spc_config_limits (process_mode, product_key, dimension_name, lsl, lcl, cl, ucl, usl, frequency) VALUES
('laser', 'E-block Cimarron BP 3D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin Cimarron BP 3D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block Cimarron BP 4D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin Cimarron BP 4D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block Cimarron BP 5D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin Cimarron BP 5D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block Dorado 5D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin Dorado 5D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block Dorado 5D AL BB', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin Dorado 5D AL BB', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block Dorado 10D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin Dorado 10D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block Marlin 10D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin Marlin 10D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block Skybolt 1D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin Skybolt 1D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block Skybolt 2D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin Skybolt 2D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block Skybolt 3D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin Skybolt 3D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block Skybolt 4D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin Skybolt 4D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block Summit 10D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin Summit 10D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block V11 4D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin V11 4D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'E-block V15 CMR 4D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin V15 CMR 4D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Dorado 5D AL BB', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('laser', 'Bobbin MR 10D', 'laser_config', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 3D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 3D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 4D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 4D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 4D', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 5D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 5D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 5D', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 3D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 3D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 4D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 4D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 4D', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 5D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 5D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Cimarron BP 5D', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'ComET', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'ComET', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 5D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 5D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 5D AL BB', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 5D AL BB', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 5D AL BB', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 5D NOAR', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 5D NOAR', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 10D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 10D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 10D', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 10D_NOAR', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 10D_NOAR', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Dorado 10D_NOAR', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'DR 10D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'DR 10D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'DR 10D', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'DR 10D NOAR', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'DR 10D NOAR', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'DR 10D NOAR', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'DR 10D NOAR-AAD', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'DR 10D NOAR-AAD', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'DR 10D NOAR-AAD', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'M11 P', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'M11 P', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Marlin 10D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Marlin 10D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Marlin 10D', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Rosewood 1D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Rosewood 1D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Rosewood 2D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Rosewood 2D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Rosewood 2D', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Skybolt 1D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Skybolt 1D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Skybolt 2D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Skybolt 2D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Skybolt 3D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Skybolt 3D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Skybolt 4D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Skybolt 4D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Summit 10D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Summit 10D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'Summit 10D', 'bobbin', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'V11 1D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'V11 1D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'V11 2D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'V11 2D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'V11 4D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'V11 4D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'V15 CMR 4D', 'long', NULL, NULL, NULL, NULL, NULL, 1),
('pof', 'V15 CMR 4D', 'short', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BP 3D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BP 3D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BP 4D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BP 4D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BP 5D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BP 5D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BP 3D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BP 3D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BP 4D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BP 4D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BP 5D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BP 5D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Dorado 5D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Dorado 5D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Dorado 5D AL BB', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Dorado 5D AL BB', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Dorado 5D NOAR', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Dorado 5D NOAR', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Dorado 10D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Dorado 10D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Dorado 10D_NOAR', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Dorado 10D_NOAR', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'DR 10D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'DR 10D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'DR 10D NOAR', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'DR 10D NOAR', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'DR 10D NOAR-AAD', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'DR 10D NOAR-AAD', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Marlin 10D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Marlin 10D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Skybolt 1D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Skybolt 1D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Skybolt 2D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Skybolt 2D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Skybolt 3D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Skybolt 3D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Skybolt 4D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Skybolt 4D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Summit 10D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Summit 10D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'V11 4D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'V11 4D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'V15 CMR 4D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'V15 CMR 4D', 'top', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BR 3D', 'bottom', NULL, NULL, NULL, NULL, NULL, 1),
('damper', 'Cimarron BR 3D', 'top', NULL, NULL, NULL, NULL, NULL, 1);

-- =========================================================================
-- INITIAL DATA: SYSTEM CONFIGS
-- =========================================================================
INSERT IGNORE INTO system_config (process_type, config_key, config_value) VALUES
('system', 'SENDER_EMAIL', 'test@belton.com'),
('system', 'SENDER_PASS', 'password123'),
('laser', 'laser_config_settings', '{}'),
('dispensing', 'dispensing_config_settings', '{}');

