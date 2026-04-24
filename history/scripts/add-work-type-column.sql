-- 为 old_supplier_devices 表添加 work_type_name 字段

ALTER TABLE old_supplier_devices 
ADD COLUMN work_type_name VARCHAR(100) DEFAULT '其他' COMMENT '当前作业类型' 
AFTER driver_name;
