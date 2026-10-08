/* =====================================================================
   COM745 shared teaching dataset: university_db
   File 1 of 2: SCHEMA (DDL)
   ---------------------------------------------------------------------
   Scenario: Practical 0 (courses, modules, lecturers, students) plus the
   Registration relationship used in the Lectures 1-2 notes.
   Target:   MySQL 8.0.16+ (CHECK constraints are enforced from 8.0.16).
             Verified on MySQL 8.0.46. Works unchanged on MySQL 8.4 LTS.
   Run in:   MySQL Workbench (File > Open SQL Script, then the lightning
             bolt) or the command line:  mysql -u root -p < university_schema.sql
   Synthetic data only. Names, emails and dates are invented.
   ===================================================================== */

-- Start clean so the script can be re-run during a demo.
DROP DATABASE IF EXISTS university_db;
CREATE DATABASE university_db;      -- CREATE SCHEMA is a synonym in MySQL
USE university_db;

/* ---------------------------------------------------------------------
   Step 1. Create the tables in dependency order: parents first.
   Keys are added afterwards with ALTER TABLE so that every constraint
   is a separate, visible step (the style used in the lecture notes).
   --------------------------------------------------------------------- */

-- LECTURER: P0 "unique employee numbers, forenames, middle names and
-- surnames, a date of birth, an email address and a rank of seniority
-- (1-40)". The Lectures 1-2 notes call this entity TUTOR.
CREATE TABLE Lecturer (
    LecturerID   INT          NOT NULL,          -- employee number
    Forename     VARCHAR(50)  NOT NULL,
    MiddleName   VARCHAR(50),                    -- optional: NULL allowed
    Surname      VARCHAR(50)  NOT NULL,
    DateOfBirth  DATE,
    Email        VARCHAR(100) NOT NULL,
    RankLevel    TINYINT      NOT NULL           -- RANK is a reserved word in MySQL 8
);

-- COURSE: "unique course code, course name and an accreditation level
-- (4-8). Each course has a coordinator, which is a lecturer."
CREATE TABLE Course (
    CourseCode          VARCHAR(10)  NOT NULL,
    CourseName          VARCHAR(100) NOT NULL,
    AccreditationLevel  TINYINT      NOT NULL,
    CoordinatorID       INT          NOT NULL    -- total participation: every course has one
);

-- MODULE: "a name, unique module code and delivered by a nominated lecturer".
CREATE TABLE Module (
    ModuleCode   VARCHAR(10)  NOT NULL,          -- COM745 is an identifier, not a number
    ModuleName   VARCHAR(100) NOT NULL,
    Credits      TINYINT      NOT NULL,
    LecturerID   INT          NOT NULL           -- every module must have a lecturer
);

-- COURSE_MODULE: "courses consist of modules". A module (e.g. COM745) can
-- belong to several courses, so this M:N relationship gets its own table.
CREATE TABLE CourseModule (
    CourseCode   VARCHAR(10)  NOT NULL,
    ModuleCode   VARCHAR(10)  NOT NULL
);

-- STUDENT: "unique student numbers, forenames, middle names and surnames,
-- a date of birth, an email address and a current enrolment level (1-20)".
CREATE TABLE Student (
    StudentID       INT          NOT NULL,
    Forename        VARCHAR(50)  NOT NULL,
    MiddleName      VARCHAR(50),
    Surname         VARCHAR(50)  NOT NULL,
    DateOfBirth     DATE,
    Email           VARCHAR(100) NOT NULL,
    Mobile          VARCHAR(20),                 -- a phone number is text: leading 0, +44
    EnrolmentLevel  TINYINT      NOT NULL,
    CourseCode      VARCHAR(10)  NOT NULL,
    Status          VARCHAR(20)  NOT NULL DEFAULT 'Active'
);

-- REGISTRATION: the M:N "registers for" relationship between Student and
-- Module. RegistrationDate and Semester describe the act of registering,
-- so they live here, not in Student or Module.
CREATE TABLE Registration (
    StudentID         INT          NOT NULL,
    ModuleCode        VARCHAR(10)  NOT NULL,
    RegistrationDate  DATE         NOT NULL,
    Semester          VARCHAR(20)  NOT NULL
);

/* ---------------------------------------------------------------------
   Step 2. Primary keys (entity integrity: unique and never NULL).
   --------------------------------------------------------------------- */
ALTER TABLE Lecturer     ADD CONSTRAINT pk_lecturer     PRIMARY KEY (LecturerID);
ALTER TABLE Course       ADD CONSTRAINT pk_course       PRIMARY KEY (CourseCode);
ALTER TABLE Module       ADD CONSTRAINT pk_module       PRIMARY KEY (ModuleCode);
ALTER TABLE CourseModule ADD CONSTRAINT pk_coursemodule PRIMARY KEY (CourseCode, ModuleCode);  -- composite
ALTER TABLE Student      ADD CONSTRAINT pk_student      PRIMARY KEY (StudentID);
ALTER TABLE Registration ADD CONSTRAINT pk_registration PRIMARY KEY (StudentID, ModuleCode);   -- composite

/* ---------------------------------------------------------------------
   Step 3. Foreign keys (referential integrity). Each one is a line on
   the ER diagram. The FK of a 1:N relationship sits on the N side.
   --------------------------------------------------------------------- */
ALTER TABLE Course
    ADD CONSTRAINT fk_course_coordinator
    FOREIGN KEY (CoordinatorID) REFERENCES Lecturer (LecturerID);

ALTER TABLE Module
    ADD CONSTRAINT fk_module_lecturer
    FOREIGN KEY (LecturerID) REFERENCES Lecturer (LecturerID);

ALTER TABLE CourseModule
    ADD CONSTRAINT fk_cm_course FOREIGN KEY (CourseCode) REFERENCES Course (CourseCode),
    ADD CONSTRAINT fk_cm_module FOREIGN KEY (ModuleCode) REFERENCES Module (ModuleCode);

ALTER TABLE Student
    ADD CONSTRAINT fk_student_course
    FOREIGN KEY (CourseCode) REFERENCES Course (CourseCode);

ALTER TABLE Registration
    ADD CONSTRAINT fk_registration_student FOREIGN KEY (StudentID)  REFERENCES Student (StudentID),
    ADD CONSTRAINT fk_registration_module  FOREIGN KEY (ModuleCode) REFERENCES Module (ModuleCode);

/* ---------------------------------------------------------------------
   Step 4. Other constraints from the business rules.
   --------------------------------------------------------------------- */
-- Alternate keys: a candidate key that was not chosen as the PK.
ALTER TABLE Lecturer ADD CONSTRAINT uq_lecturer_email UNIQUE (Email);
ALTER TABLE Student  ADD CONSTRAINT uq_student_email  UNIQUE (Email);

-- Enumerated ranges from Practical 0.
ALTER TABLE Lecturer ADD CONSTRAINT chk_lecturer_rank   CHECK (RankLevel BETWEEN 1 AND 40);
ALTER TABLE Course   ADD CONSTRAINT chk_course_level    CHECK (AccreditationLevel BETWEEN 4 AND 8);
ALTER TABLE Student  ADD CONSTRAINT chk_student_level   CHECK (EnrolmentLevel BETWEEN 1 AND 20);
ALTER TABLE Module   ADD CONSTRAINT chk_module_credits  CHECK (Credits > 0);

-- Check the result.
SHOW TABLES;
