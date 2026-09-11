-- 集成测试用的库。只在数据卷第一次创建时执行一次。
-- 开发库 haccp 由 POSTGRES_DB 建，这里只补测试库。
CREATE DATABASE haccp_test OWNER kaispan;
