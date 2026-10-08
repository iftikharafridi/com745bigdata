/* =====================================================================
   COM745 schedule: the ONLY file you edit to move topics between weeks.
   ---------------------------------------------------------------------
   TOPICS  - every teaching topic, defined once (title, page, sources).
   WEEKS   - which topics are taught in which week. To move a topic,
             cut its id from one week's "topics" list and paste it into
             another. No other file needs to change.
   status: "ready" = page built; "planned" = shown in the menu, greyed.
   Week 1 began w/c 28 Sep 2026 (handbook teaching plan, pp.19-21).
   ===================================================================== */
window.COM745 = window.COM745 || {};

COM745.TOPICS = {
  "relational":  { title: "Relational databases and MySQL", short: "Relational & MySQL", page: "topics/relational.html", status: "ready",
                   sources: "Lectures 0-2 · Practicals 0-1 · Lectures 1-2 notes · ER mapping tutorial", tech: "MySQL" },
  "nosql":       { title: "NoSQL concepts", short: "NoSQL concepts", page: "topics/nosql.html", status: "ready",
                   sources: "Lecture 3", tech: "Concepts" },
  "mongodb":     { title: "Document databases and MongoDB", short: "MongoDB", page: "topics/mongodb.html", status: "ready",
                   sources: "Lecture 4 · Practicals 3-4", tech: "MongoDB" },
  "influxdb":    { title: "Time-series databases and InfluxDB", short: "InfluxDB", page: "topics/influxdb.html", status: "ready",
                   sources: "Lecture 5 · Practicals 6-7", tech: "InfluxDB 1.x" },
  "neo4j":       { title: "Graph databases and Neo4j", short: "Neo4j", page: "topics/neo4j.html", status: "ready",
                   sources: "Lecture 6 · Practicals 9-10", tech: "Neo4j" },
  "gdpr":        { title: "GDPR and IoT data", short: "GDPR", page: "topics/gdpr.html", status: "planned",
                   sources: "Lecture 7", tech: "Concepts" },
  "cloud":       { title: "Cloud and distributed computing", short: "Cloud & distributed", page: "topics/cloud.html", status: "planned",
                   sources: "Lecture 9a", tech: "Concepts" },
  "db-review":   { title: "Choosing a database: review", short: "Database review", page: "topics/db-review.html", status: "planned",
                   sources: "Lecture 8a (Lecture 8 semantic stores, optional)", tech: "CW1 revision" },
  "hadoop":      { title: "Hadoop architecture", short: "Hadoop", page: "topics/hadoop.html", status: "planned",
                   sources: "Lecture 9b", tech: "HDP 2.6 sandbox" },
  "functional":  { title: "Functional programming and MapReduce", short: "Functional & MapReduce", page: "topics/functional.html", status: "planned",
                   sources: "Lecture 10", tech: "Python" },
  "linux":       { title: "Linux command line", short: "Linux", page: "topics/linux.html", status: "planned",
                   sources: "Practical 14", tech: "HDP 2.6 sandbox" },
  "hdfs":        { title: "HDFS", short: "HDFS", page: "topics/hdfs.html", status: "planned",
                   sources: "Practicals 15-16", tech: "HDP 2.6 sandbox" },
  "spark":       { title: "Apache Spark with PySpark", short: "Spark", page: "topics/spark.html", status: "planned",
                   sources: "Lecture 11 · Practicals 17, 18, 20", tech: "PySpark" },
  "pig":         { title: "Apache Pig", short: "Pig", page: "topics/pig.html", status: "planned",
                   sources: "Lecture 12 · Practicals 22-23", tech: "HDP 2.6 sandbox" },
  "hive":        { title: "Apache Hive", short: "Hive", page: "topics/hive.html", status: "planned",
                   sources: "Practical 19", tech: "HDP 2.6 sandbox" },
  "zeppelin":    { title: "Visualisation with Zeppelin", short: "Zeppelin", page: "topics/zeppelin.html", status: "planned",
                   sources: "Practical 21", tech: "HDP 2.6 sandbox" },
  "cw2":         { title: "CW2 data lake project: method", short: "CW2 method", page: "topics/cw2.html", status: "planned",
                   sources: "Handbook CW2 brief", tech: "Assessment support" },
  "databricks":  { title: "Introduction to Databricks", short: "Databricks", page: "topics/databricks.html", status: "planned",
                   sources: "Handbook Week 12 (optional)", tech: "Databricks Free Edition" }
};

COM745.WEEKS = [
  { week: 1,  wc: "28 Sep", group: "Databases",           topics: ["relational"] },
  { week: 2,  wc: "5 Oct",  group: "Databases",           topics: ["nosql", "mongodb"] },
  { week: 3,  wc: "12 Oct", group: "Databases",           topics: ["influxdb"] },
  { week: 4,  wc: "19 Oct", group: "Databases",           topics: ["neo4j"], note: "CW2 released" },
  { week: 5,  wc: "26 Oct", group: "Databases",           topics: ["gdpr", "cloud", "db-review"], note: "Catch-up on Practicals 0-10" },
  { week: 6,  wc: "2 Nov",  group: "Big data",            topics: ["hadoop", "functional", "linux"] },
  { week: 7,  wc: "9 Nov",  group: "Big data",            topics: ["spark", "hdfs"], note: "CW1 in the lab, 9 Nov" },
  { week: 8,  wc: "16 Nov", group: "Big data",            topics: ["pig", "spark"] },
  { week: 9,  wc: "23 Nov", group: "Big data",            topics: ["hive", "spark"] },
  { week: 10, wc: "30 Nov", group: "Big data",            topics: ["zeppelin", "pig"] },
  { week: 11, wc: "7 Dec",  group: "Big data",            topics: ["pig", "functional", "cw2"], note: "CW2 due Fri 11 Dec, 12:00" },
  { week: 12, wc: "14 Dec", group: "Big data",            topics: ["databricks"] }
];
