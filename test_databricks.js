import dotenv from 'dotenv';
dotenv.config();

console.log("DATABRICKS_URL:", process.env.DATABRICKS_URL);
console.log("DBX_PAT exists:", Boolean(process.env.DBX_PAT));
console.log("Current directory:", process.cwd());
