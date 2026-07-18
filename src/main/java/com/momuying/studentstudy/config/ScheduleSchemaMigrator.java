package com.momuying.studentstudy.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;

@Component
public class ScheduleSchemaMigrator implements ApplicationRunner {
    private final DataSource dataSource;
    private final JdbcTemplate jdbcTemplate;

    public ScheduleSchemaMigrator(DataSource dataSource, JdbcTemplate jdbcTemplate) {
        this.dataSource = dataSource;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!hasColumn("weekly_schedule_items", "week_day")) {
            jdbcTemplate.execute("ALTER TABLE weekly_schedule_items ADD COLUMN week_day TINYINT NULL AFTER schedule_date");
            jdbcTemplate.execute("""
                    UPDATE weekly_schedule_items
                    SET week_day = ((DAYOFWEEK(schedule_date) + 5) % 7) + 1
                    WHERE schedule_date IS NOT NULL
                    """);
        }
        if (!hasColumn("weekly_schedule_items", "sort_order")) {
            jdbcTemplate.execute("ALTER TABLE weekly_schedule_items ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER note");
        }
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS schedule_checkins (
                  id BIGINT PRIMARY KEY AUTO_INCREMENT,
                  schedule_item_id BIGINT NOT NULL,
                  child_id BIGINT NOT NULL,
                  check_date DATE NOT NULL,
                  actual_start_at DATETIME NULL,
                  actual_end_at DATETIME NULL,
                  note VARCHAR(500) NULL,
                  status VARCHAR(32) NOT NULL DEFAULT 'DONE',
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  UNIQUE KEY uk_schedule_checkin_day (schedule_item_id, child_id, check_date),
                  KEY idx_checkin_child_date (child_id, check_date, status)
                )
                """);
    }

    private boolean hasColumn(String table, String column) throws Exception {
        try (Connection connection = dataSource.getConnection();
             ResultSet columns = connection.getMetaData().getColumns(connection.getCatalog(), null, table, column)) {
            return columns.next();
        }
    }
}
