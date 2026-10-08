/* =====================================================================
   COM745 shared teaching dataset: university_db
   File 2 of 2: SEED DATA (DML)
   ---------------------------------------------------------------------
   Run after university_schema.sql. Rows are inserted parents-first so
   every foreign key value already exists when it is referenced.
   Synthetic data only.
     6 lecturers  - Dr Harris (6) teaches no module: partial participation
     3 courses    - each coordinated by a lecturer
     6 modules    - COM750 has no students yet: the "insertion anomaly" case
    24 students   - John Smith (1003) has no registrations: shows LEFT JOIN
    26 registrations, 4-7 students per taught module (Practical 1, T3)
   ===================================================================== */
USE university_db;

-- Always name the columns: it documents intent and survives column re-ordering.
INSERT INTO Lecturer (LecturerID, Forename, MiddleName, Surname, DateOfBirth, Email, RankLevel) VALUES
(1, 'Emily',  NULL,      'Brown',  '1978-10-15', 'e.brown@uni.example.ac.uk',  28),
(2, 'Imran',  NULL,      'Khan',   '1985-06-20', 'i.khan@uni.example.ac.uk',   24),
(3, 'Laura',  'Anne',    'Wilson', '1972-03-10', 'l.wilson@uni.example.ac.uk', 38),
(4, 'Daniel', NULL,      'Okafor', '1988-12-05', 'd.okafor@uni.example.ac.uk', 18),
(5, 'Mei',    NULL,      'Chen',   '1983-02-27', 'm.chen@uni.example.ac.uk',   21),
(6, 'Thomas', 'Edward',  'Harris', '1991-07-30', 't.harris@uni.example.ac.uk', 12);

INSERT INTO Course (CourseCode, CourseName, AccreditationLevel, CoordinatorID) VALUES
('MSCCST', 'MSc Computer Science and Technology', 7, 3),
('MSCDS',  'MSc Data Science',                    7, 5),
('BSCCS',  'BSc Computing',                       6, 4);

INSERT INTO Module (ModuleCode, ModuleName, Credits, LecturerID) VALUES
('COM745', 'Big Data and Infrastructure',     20, 1),
('COM746', 'Database Systems',                20, 2),
('COM747', 'Data Science and Machine Learning', 20, 5),
('COM748', 'Cloud Computing',                 20, 4),
('COM750', 'Artificial Intelligence',         20, 3),
('COM760', 'Masters Project',                 60, 3);

INSERT INTO CourseModule (CourseCode, ModuleCode) VALUES
('MSCCST', 'COM745'), ('MSCCST', 'COM746'), ('MSCCST', 'COM747'),
('MSCCST', 'COM748'), ('MSCCST', 'COM750'), ('MSCCST', 'COM760'),
('MSCDS',  'COM745'), ('MSCDS',  'COM747'), ('MSCDS',  'COM750'), ('MSCDS', 'COM760'),
('BSCCS',  'COM746'), ('BSCCS',  'COM748');

-- Status is left out: the DEFAULT 'Active' fills it in.
INSERT INTO Student (StudentID, Forename, MiddleName, Surname, DateOfBirth, Email, Mobile, EnrolmentLevel, CourseCode) VALUES
(1001, 'Ahmed',  NULL,     'Ali',      '2000-05-10', 'ahmed.ali@students.example.ac.uk',      NULL,            7, 'MSCCST'),
(1002, 'Sarah',  'Jane',   'Khan',     '2001-08-15', 'sarah.khan@students.example.ac.uk',     '07700 900123',  7, 'MSCCST'),
(1003, 'John',   NULL,     'Smith',    '1999-12-03', 'john.smith@students.example.ac.uk',     NULL,            7, 'MSCCST'),
(1004, 'Priya',  NULL,     'Patel',    '2000-01-22', 'priya.patel@students.example.ac.uk',    '07700 900456',  7, 'MSCCST'),
(1005, 'Daniel', 'James',  'Murphy',   '1998-09-30', 'daniel.murphy@students.example.ac.uk',  NULL,            7, 'MSCCST'),
(1006, 'Fatima', 'Zahra',  'Hussain',  '2001-04-12', 'fatima.hussain@students.example.ac.uk', '07700 900789',  7, 'MSCCST'),
(1007, 'Oliver', NULL,     'Bennett',  '1999-07-08', 'oliver.bennett@students.example.ac.uk', NULL,            7, 'MSCCST'),
(1008, 'Aisha',  NULL,     'Bello',    '2000-11-19', 'aisha.bello@students.example.ac.uk',    '07700 900234',  7, 'MSCCST'),
(1009, 'Lucas',  NULL,     'Silva',    '1997-03-03', 'lucas.silva@students.example.ac.uk',    NULL,            7, 'MSCCST'),
(1010, 'Hannah', 'Rose',   'Clarke',   '2000-06-25', 'hannah.clarke@students.example.ac.uk',  '07700 900567',  7, 'MSCCST'),
(1011, 'Bilal',  NULL,     'Ahmed',    '1999-10-14', 'bilal.ahmed@students.example.ac.uk',    NULL,            7, 'MSCCST'),
(1012, 'Chloe',  NULL,     'Evans',    '2001-02-09', 'chloe.evans@students.example.ac.uk',    '07700 900890',  7, 'MSCCST'),
(1013, 'Wei',    NULL,     'Zhang',    '1998-12-17', 'wei.zhang@students.example.ac.uk',      NULL,            7, 'MSCDS'),
(1014, 'Grace',  'Ann',    'Thompson', '2000-08-01', 'grace.thompson@students.example.ac.uk', '07700 900345',  7, 'MSCDS'),
(1015, 'Omar',   NULL,     'Farouk',   '1999-05-28', 'omar.farouk@students.example.ac.uk',    NULL,            7, 'MSCDS'),
(1016, 'Sofia',  NULL,     'Rossi',    '2001-09-05', 'sofia.rossi@students.example.ac.uk',    '07700 900678',  7, 'MSCDS'),
(1017, 'Kwame',  NULL,     'Mensah',   '1998-04-16', 'kwame.mensah@students.example.ac.uk',   NULL,            7, 'MSCDS'),
(1018, 'Emma',   'Louise', 'Brown',    '2000-10-30', 'emma.brown@students.example.ac.uk',     '07700 900901',  7, 'MSCDS'),
(1019, 'Arjun',  NULL,     'Singh',    '1999-01-11', 'arjun.singh@students.example.ac.uk',    NULL,            7, 'MSCDS'),
(1020, 'Megan',  NULL,     'Walsh',    '2004-03-21', 'megan.walsh@students.example.ac.uk',    '07700 900112',  6, 'BSCCS'),
(1021, 'Yusuf',  NULL,     'Kaya',     '2003-07-02', 'yusuf.kaya@students.example.ac.uk',     NULL,            6, 'BSCCS'),
(1022, 'Ella',   NULL,     'Morgan',   '2004-11-13', 'ella.morgan@students.example.ac.uk',    '07700 900113',  6, 'BSCCS'),
(1023, 'Ryan',   NULL,     'O''Neill', '2003-05-24', 'ryan.oneill@students.example.ac.uk',    NULL,            6, 'BSCCS'),  -- '' escapes the apostrophe
(1024, 'Zara',   NULL,     'Malik',    '2004-01-07', 'zara.malik@students.example.ac.uk',     '07700 900114',  6, 'BSCCS');

INSERT INTO Registration (StudentID, ModuleCode, RegistrationDate, Semester) VALUES
-- COM745 Big Data and Infrastructure: 7 students
(1001, 'COM745', '2026-09-21', 'Semester 1'),
(1002, 'COM745', '2026-09-22', 'Semester 1'),
(1004, 'COM745', '2026-09-22', 'Semester 1'),
(1013, 'COM745', '2026-09-23', 'Semester 1'),
(1014, 'COM745', '2026-09-23', 'Semester 1'),
(1015, 'COM745', '2026-09-24', 'Semester 1'),
(1016, 'COM745', '2026-09-24', 'Semester 1'),
-- COM746 Database Systems: 5 students
(1001, 'COM746', '2026-09-21', 'Semester 1'),
(1005, 'COM746', '2026-09-22', 'Semester 1'),
(1020, 'COM746', '2026-09-23', 'Semester 1'),
(1021, 'COM746', '2026-09-23', 'Semester 1'),
(1022, 'COM746', '2026-09-25', 'Semester 1'),
-- COM747 Data Science and Machine Learning: 6 students
(1002, 'COM747', '2026-09-22', 'Semester 1'),
(1006, 'COM747', '2026-09-22', 'Semester 1'),
(1013, 'COM747', '2026-09-23', 'Semester 1'),
(1017, 'COM747', '2026-09-24', 'Semester 1'),
(1018, 'COM747', '2026-09-24', 'Semester 1'),
(1019, 'COM747', '2026-09-25', 'Semester 1'),
-- COM748 Cloud Computing: 4 students
(1007, 'COM748', '2026-09-21', 'Semester 1'),
(1008, 'COM748', '2026-09-22', 'Semester 1'),
(1023, 'COM748', '2026-09-24', 'Semester 1'),
(1024, 'COM748', '2026-09-25', 'Semester 1'),
-- COM760 Masters Project: 4 students
(1009, 'COM760', '2026-09-21', 'Semester 3'),
(1010, 'COM760', '2026-09-21', 'Semester 3'),
(1011, 'COM760', '2026-09-22', 'Semester 3'),
(1012, 'COM760', '2026-09-22', 'Semester 3');

-- Quick check: one row per table with its row count.
SELECT 'Lecturer' AS TableName, COUNT(*) AS RowCount FROM Lecturer
UNION ALL SELECT 'Course',       COUNT(*) FROM Course
UNION ALL SELECT 'Module',       COUNT(*) FROM Module
UNION ALL SELECT 'CourseModule', COUNT(*) FROM CourseModule
UNION ALL SELECT 'Student',      COUNT(*) FROM Student
UNION ALL SELECT 'Registration', COUNT(*) FROM Registration;
