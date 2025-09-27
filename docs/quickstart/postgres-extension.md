# Quickstart: Using the Generic PostgreSQL Extension

Gemini CLI includes a pre-built extension for connecting to any PostgreSQL database, allowing you to query and manage your database using natural language.

This guide covers how to activate and configure this extension. To learn more, go to https://github.com/gemini-cli-extensions/postgres.

## Installation

```bash
gemini extensions install github.com/gemini-cli-extensions/postgres.git
```

## Prerequisites

### Set up the database

1. Create or select a PostgreSQL instance.

    * [Install PostgreSQL locally](https://www.postgresql.org/download/)
    * [Install AlloyDB Omni](https://cloud.google.com/alloydb/omni/current/docs/quickstart)

1. Create or reuse [a database
   user](https://cloud.google.com/alloydb/omni/current/docs/database-users/manage-users)
   and have the username and password ready.

## Configuration

After activating the extension, configure it by setting the following environment variables:

- `POSTGRES_HOST`: The hostname or IP address of the PostgreSQL server.
- `POSTGRES_PORT`: The port number for the PostgreSQL server.
- `POSTGRES_DATABASE`: The name of the database to connect to.
- `POSTGRES_USER`: The database username.
- `POSTGRES_PASSWORD`: The password for the database user.
- `POSTGRES_QUERY_PARAMS`: (Optional) Raw query to be added to the db connection string.

### Permissions

Ensure the configured database user has the necessary database-level permissions (e.g., `SELECT`, `INSERT`) to execute the desired queries.

## Supported Tools

This extension provides the following tools. Note that these can be used in combination with core Gemini CLI tools (like `write_file` and `run_shell_command`).

- `execute_sql`: Executes a SQL query.
- `list_tables`: Lists tables in the database.
- `list_autovacuum_configurations`: Lists autovacuum configurations in the database.
- `list_memory_configurations`: Lists memory-related configurations in the database.
- `list_top_bloated_tables`: Lists the top bloated tables in the database.
- `list_replication_slots`: Lists replication slots in the database.
- `list_invalid_indexes`: Lists invalid indexes in the database.
- `get_query_plan`: Generates the execution plan of a statement.

## Usage Examples

### A Developer's Story

This section follows a developer, Alex, as they use the PostgreSQL extension to diagnose a slow user profile page in their application.

#### Step 1: Exploring the Schema

Alex's first step is to understand the database structure related to user profiles.

> "List all tables in the database."
*Tool Used*: `list_tables`

#### Step 2: Analyzing the Slow Query

After identifying the `users` and `user_profiles` tables, Alex suspects the query joining them is inefficient. They decide to check the execution plan.

> "What is the execution plan for the query 'SELECT * FROM users u JOIN user_profiles up ON u.id = up.user_id WHERE u.id = 123'?"
*Tool Used*: `get_query_plan`

#### Step 3: Discovering an Indexing Problem

The query plan reveals a slow sequential scan. Alex wonders if there's an issue with the indexes on the tables.

> "Show me all invalid indexes."
*Tool Used*: `list_invalid_indexes`

#### Step 4: Checking Overall Database Health

Finding an invalid index prompts Alex to run a broader health check, looking for other common performance issues like table bloat.

> "Show me the top 10 most bloated tables."
*Tool Used*: `list_top_bloated_tables`

### Conclusion

In just a few minutes, using natural language, Alex has gone from a vague performance complaint to a concrete action plan: fix the invalid index and address table bloat. This demonstrates how the extension can accelerate development and debugging workflows.

### Data Analyst Journey: Extracting Data for a Report

Maria, a data analyst, needs to pull data for a sales report.

#### Step 1: Find Relevant Tables
Maria starts by looking for tables related to sales and customers.
> "List all tables that have 'sales' or 'customers' in their names."
*Tool Used*: `list_tables`

#### Step 2: Explore Table Schemas
To understand how to join them, she inspects the schemas.
> "Show me the schema for the 'sales' and 'customers' tables."
*Tool Used*: `execute_sql`

#### Step 3: Query the Data
Maria writes a query to get the total sales for each customer.
> "Write a SQL query to get the total sales amount for each customer by joining the 'sales' and 'customers' tables on the customer ID."
*Tool Used*: `execute_sql`

#### Step 4: Save the Results
She saves the data to a CSV file for her report.
> "Save the results of the previous query to a file named 'sales_by_customer.csv'."
*Tool Used*: `write_file`

### Database Administrator (DBA) Journey: Routine Maintenance

David, a DBA, performs his daily checks to ensure the database is healthy.

#### Step 1: Check for Long-Running Queries
David looks for queries that might be slowing down the system.
> "Are there any queries that have been running for more than 10 minutes?"
*Tool Used*: `execute_sql` (querying `pg_stat_activity`)

#### Step 2: Review Autovacuum Configurations
He reviews the autovacuum settings to ensure they are optimized for the workload.
> "Show me the autovacuum configurations."
*Tool Used*: `list_autovacuum_configurations`

#### Step 3: Check Memory Configurations
David checks the memory-related configurations to prevent performance bottlenecks.
> "List all memory-related configurations."
*Tool Used*: `list_memory_configurations`

#### Step 4: Monitor Database Size
He checks the overall size of the database to track its growth.
> "What's the total size of the database?"
*Tool Used*: `execute_sql` (using `pg_database_size()`)

#### Step 5: Verify Replication Status
David ensures that the read replicas are in sync.
> "Show me the current replication status and lag."
*Tool Used*: `list_replication_slots`

#### Step 6: Initiate a Backup
He kicks off a manual backup of a critical database.
> "Create a backup of the 'production' database and store it in the '/backups' directory."
*Tool Used*: `run_shell_command` (using `pg_dump`)

### New Developer Onboarding Journey: Learning the Ropes

Sarah, a new developer, is getting acquainted with the project's database.

#### Step 1: Get an Overview
Her first step is to see all the tables in the database.
> "List all the tables in the database."
*Tool Used*: `list_tables`

#### Step 2: Examine a Table
She decides to dive deeper into the `products` table.
> "Show me the columns and their data types for the 'products' table."
*Tool Used*: `execute_sql`

#### Step 3: Preview Table Data
Sarah wants to see some sample data to understand the content.
> "Show me the first 5 rows from the 'products' table."
*Tool Used*: `execute_sql`

#### Step 4: Understand Table Relationships
She wants to know how products relate to other tables.
> "What are the foreign key relationships for the 'products' table?"
*Tool Used*: `execute_sql`

### Test Data Generation Journey: Populating a New Table

A developer, Sam, needs to create some test data for a new `products` table.

#### Step 1: Create the Table
Sam first needs to create the `products` table.
> "Create a table named 'products' with columns for 'id' (integer, primary key), 'name' (varchar), and 'price' (decimal)."
*Tool Used*: `execute_sql`

#### Step 2: Insert a Single Row
Sam inserts a single product to verify the table structure.
> "Insert a product with id 1, name 'Laptop', and price 1200.00 into the 'products' table."
*Tool Used*: `execute_sql`

#### Step 3: Insert Multiple Rows
Now, Sam wants to add a few more products in a single command.
> "Insert the following products into the 'products' table: (2, 'Keyboard', 75.00), (3, 'Mouse', 25.00), (4, 'Monitor', 300.00)."
*Tool Used*: `execute_sql`

#### Step 4: Verify the Data
Finally, Sam checks that the data was inserted correctly.
> "Show me all the data from the 'products' table."
*Tool Used*: `execute_sql`
