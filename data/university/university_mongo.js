/* =====================================================================
   COM745 shared teaching dataset: university_db for MongoDB (mongosh)
   ---------------------------------------------------------------------
   The same people, modules and registrations as the MySQL version,
   modelled as documents. Students EMBED their registrations; modules
   REFERENCE their lecturer by _id. Missing values are left out.
   Run in mongosh:   load('university_mongo.js')
   or paste into the mongosh panel at the bottom of MongoDB Compass.
   Re-running it drops and rebuilds the database.
   Synthetic data only.
   ===================================================================== */
db = db.getSiblingDB('uni_db');
db.dropDatabase();

db.lecturers.insertMany([
  {
    _id: 1,
    name: { forename: 'Emily', surname: 'Brown' },
    dateOfBirth: ISODate('1978-10-15T00:00:00.000Z'),
    email: 'e.brown@uni.example.ac.uk',
    rank: 28
  },
  {
    _id: 2,
    name: { forename: 'Imran', surname: 'Khan' },
    dateOfBirth: ISODate('1985-06-20T00:00:00.000Z'),
    email: 'i.khan@uni.example.ac.uk',
    rank: 24
  },
  {
    _id: 3,
    name: { forename: 'Laura', middle: 'Anne', surname: 'Wilson' },
    dateOfBirth: ISODate('1972-03-10T00:00:00.000Z'),
    email: 'l.wilson@uni.example.ac.uk',
    rank: 38
  },
  {
    _id: 4,
    name: { forename: 'Daniel', surname: 'Okafor' },
    dateOfBirth: ISODate('1988-12-05T00:00:00.000Z'),
    email: 'd.okafor@uni.example.ac.uk',
    rank: 18
  },
  {
    _id: 5,
    name: { forename: 'Mei', surname: 'Chen' },
    dateOfBirth: ISODate('1983-02-27T00:00:00.000Z'),
    email: 'm.chen@uni.example.ac.uk',
    rank: 21
  },
  {
    _id: 6,
    name: { forename: 'Thomas', middle: 'Edward', surname: 'Harris' },
    dateOfBirth: ISODate('1991-07-30T00:00:00.000Z'),
    email: 't.harris@uni.example.ac.uk',
    rank: 12
  }
]);

db.courses.insertMany([
  {
    _id: 'MSCCST',
    name: 'MSc Computer Science and Technology',
    level: 7,
    coordinatorId: 3,
    modules: [ 'COM745', 'COM746', 'COM747', 'COM748', 'COM750', 'COM760' ]
  },
  {
    _id: 'MSCDS',
    name: 'MSc Data Science',
    level: 7,
    coordinatorId: 5,
    modules: [ 'COM745', 'COM747', 'COM750', 'COM760' ]
  },
  { _id: 'BSCCS', name: 'BSc Computing', level: 6, coordinatorId: 4, modules: [ 'COM746', 'COM748' ] }
]);

db.modules.insertMany([
  { _id: 'COM745', name: 'Big Data and Infrastructure', credits: 20, lecturerId: 1 },
  { _id: 'COM746', name: 'Database Systems', credits: 20, lecturerId: 2 },
  { _id: 'COM747', name: 'Data Science and Machine Learning', credits: 20, lecturerId: 5 },
  { _id: 'COM748', name: 'Cloud Computing', credits: 20, lecturerId: 4 },
  { _id: 'COM750', name: 'Artificial Intelligence', credits: 20, lecturerId: 3 },
  { _id: 'COM760', name: 'Masters Project', credits: 60, lecturerId: 3 }
]);

db.students.insertMany([
  {
    _id: 1001,
    forename: 'Ahmed',
    surname: 'Ali',
    dateOfBirth: ISODate('2000-05-10T00:00:00.000Z'),
    email: 'ahmed.ali@students.example.ac.uk',
    level: 7,
    course: 'MSCCST',
    status: 'Active',
    registrations: [
      { module: 'COM745', date: ISODate('2026-09-21T00:00:00.000Z'), semester: 'Semester 1' },
      { module: 'COM746', date: ISODate('2026-09-21T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1002,
    forename: 'Sarah',
    middleName: 'Jane',
    surname: 'Khan',
    dateOfBirth: ISODate('2001-08-15T00:00:00.000Z'),
    email: 'sarah.khan@students.example.ac.uk',
    mobile: '07700 900123',
    level: 7,
    course: 'MSCCST',
    status: 'Active',
    registrations: [
      { module: 'COM745', date: ISODate('2026-09-22T00:00:00.000Z'), semester: 'Semester 1' },
      { module: 'COM747', date: ISODate('2026-09-22T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1003,
    forename: 'John',
    surname: 'Smith',
    dateOfBirth: ISODate('1999-12-03T00:00:00.000Z'),
    email: 'john.smith@students.example.ac.uk',
    level: 7,
    course: 'MSCCST',
    status: 'Active',
    registrations: []
  },
  {
    _id: 1004,
    forename: 'Priya',
    surname: 'Patel',
    dateOfBirth: ISODate('2000-01-22T00:00:00.000Z'),
    email: 'priya.patel@students.example.ac.uk',
    mobile: '07700 900456',
    level: 7,
    course: 'MSCCST',
    status: 'Active',
    registrations: [
      { module: 'COM745', date: ISODate('2026-09-22T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1005,
    forename: 'Daniel',
    middleName: 'James',
    surname: 'Murphy',
    dateOfBirth: ISODate('1998-09-30T00:00:00.000Z'),
    email: 'daniel.murphy@students.example.ac.uk',
    level: 7,
    course: 'MSCCST',
    status: 'Active',
    registrations: [
      { module: 'COM746', date: ISODate('2026-09-22T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1006,
    forename: 'Fatima',
    middleName: 'Zahra',
    surname: 'Hussain',
    dateOfBirth: ISODate('2001-04-12T00:00:00.000Z'),
    email: 'fatima.hussain@students.example.ac.uk',
    mobile: '07700 900789',
    level: 7,
    course: 'MSCCST',
    status: 'Active',
    registrations: [
      { module: 'COM747', date: ISODate('2026-09-22T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1007,
    forename: 'Oliver',
    surname: 'Bennett',
    dateOfBirth: ISODate('1999-07-08T00:00:00.000Z'),
    email: 'oliver.bennett@students.example.ac.uk',
    level: 7,
    course: 'MSCCST',
    status: 'Active',
    registrations: [
      { module: 'COM748', date: ISODate('2026-09-21T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1008,
    forename: 'Aisha',
    surname: 'Bello',
    dateOfBirth: ISODate('2000-11-19T00:00:00.000Z'),
    email: 'aisha.bello@students.example.ac.uk',
    mobile: '07700 900234',
    level: 7,
    course: 'MSCCST',
    status: 'Active',
    registrations: [
      { module: 'COM748', date: ISODate('2026-09-22T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1009,
    forename: 'Lucas',
    surname: 'Silva',
    dateOfBirth: ISODate('1997-03-03T00:00:00.000Z'),
    email: 'lucas.silva@students.example.ac.uk',
    level: 7,
    course: 'MSCCST',
    status: 'Active',
    registrations: [
      { module: 'COM760', date: ISODate('2026-09-21T00:00:00.000Z'), semester: 'Semester 3' }
    ]
  },
  {
    _id: 1010,
    forename: 'Hannah',
    middleName: 'Rose',
    surname: 'Clarke',
    dateOfBirth: ISODate('2000-06-25T00:00:00.000Z'),
    email: 'hannah.clarke@students.example.ac.uk',
    mobile: '07700 900567',
    level: 7,
    course: 'MSCCST',
    status: 'Active',
    registrations: [
      { module: 'COM760', date: ISODate('2026-09-21T00:00:00.000Z'), semester: 'Semester 3' }
    ]
  },
  {
    _id: 1011,
    forename: 'Bilal',
    surname: 'Ahmed',
    dateOfBirth: ISODate('1999-10-14T00:00:00.000Z'),
    email: 'bilal.ahmed@students.example.ac.uk',
    level: 7,
    course: 'MSCCST',
    status: 'Active',
    registrations: [
      { module: 'COM760', date: ISODate('2026-09-22T00:00:00.000Z'), semester: 'Semester 3' }
    ]
  },
  {
    _id: 1012,
    forename: 'Chloe',
    surname: 'Evans',
    dateOfBirth: ISODate('2001-02-09T00:00:00.000Z'),
    email: 'chloe.evans@students.example.ac.uk',
    mobile: '07700 900890',
    level: 7,
    course: 'MSCCST',
    status: 'Active',
    registrations: [
      { module: 'COM760', date: ISODate('2026-09-22T00:00:00.000Z'), semester: 'Semester 3' }
    ]
  },
  {
    _id: 1013,
    forename: 'Wei',
    surname: 'Zhang',
    dateOfBirth: ISODate('1998-12-17T00:00:00.000Z'),
    email: 'wei.zhang@students.example.ac.uk',
    level: 7,
    course: 'MSCDS',
    status: 'Active',
    registrations: [
      { module: 'COM745', date: ISODate('2026-09-23T00:00:00.000Z'), semester: 'Semester 1' },
      { module: 'COM747', date: ISODate('2026-09-23T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1014,
    forename: 'Grace',
    middleName: 'Ann',
    surname: 'Thompson',
    dateOfBirth: ISODate('2000-08-01T00:00:00.000Z'),
    email: 'grace.thompson@students.example.ac.uk',
    mobile: '07700 900345',
    level: 7,
    course: 'MSCDS',
    status: 'Active',
    registrations: [
      { module: 'COM745', date: ISODate('2026-09-23T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1015,
    forename: 'Omar',
    surname: 'Farouk',
    dateOfBirth: ISODate('1999-05-28T00:00:00.000Z'),
    email: 'omar.farouk@students.example.ac.uk',
    level: 7,
    course: 'MSCDS',
    status: 'Active',
    registrations: [
      { module: 'COM745', date: ISODate('2026-09-24T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1016,
    forename: 'Sofia',
    surname: 'Rossi',
    dateOfBirth: ISODate('2001-09-05T00:00:00.000Z'),
    email: 'sofia.rossi@students.example.ac.uk',
    mobile: '07700 900678',
    level: 7,
    course: 'MSCDS',
    status: 'Active',
    registrations: [
      { module: 'COM745', date: ISODate('2026-09-24T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1017,
    forename: 'Kwame',
    surname: 'Mensah',
    dateOfBirth: ISODate('1998-04-16T00:00:00.000Z'),
    email: 'kwame.mensah@students.example.ac.uk',
    level: 7,
    course: 'MSCDS',
    status: 'Active',
    registrations: [
      { module: 'COM747', date: ISODate('2026-09-24T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1018,
    forename: 'Emma',
    middleName: 'Louise',
    surname: 'Brown',
    dateOfBirth: ISODate('2000-10-30T00:00:00.000Z'),
    email: 'emma.brown@students.example.ac.uk',
    mobile: '07700 900901',
    level: 7,
    course: 'MSCDS',
    status: 'Active',
    registrations: [
      { module: 'COM747', date: ISODate('2026-09-24T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1019,
    forename: 'Arjun',
    surname: 'Singh',
    dateOfBirth: ISODate('1999-01-11T00:00:00.000Z'),
    email: 'arjun.singh@students.example.ac.uk',
    level: 7,
    course: 'MSCDS',
    status: 'Active',
    registrations: [
      { module: 'COM747', date: ISODate('2026-09-25T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1020,
    forename: 'Megan',
    surname: 'Walsh',
    dateOfBirth: ISODate('2004-03-21T00:00:00.000Z'),
    email: 'megan.walsh@students.example.ac.uk',
    mobile: '07700 900112',
    level: 6,
    course: 'BSCCS',
    status: 'Active',
    registrations: [
      { module: 'COM746', date: ISODate('2026-09-23T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1021,
    forename: 'Yusuf',
    surname: 'Kaya',
    dateOfBirth: ISODate('2003-07-02T00:00:00.000Z'),
    email: 'yusuf.kaya@students.example.ac.uk',
    level: 6,
    course: 'BSCCS',
    status: 'Active',
    registrations: [
      { module: 'COM746', date: ISODate('2026-09-23T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1022,
    forename: 'Ella',
    surname: 'Morgan',
    dateOfBirth: ISODate('2004-11-13T00:00:00.000Z'),
    email: 'ella.morgan@students.example.ac.uk',
    mobile: '07700 900113',
    level: 6,
    course: 'BSCCS',
    status: 'Active',
    registrations: [
      { module: 'COM746', date: ISODate('2026-09-25T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1023,
    forename: 'Ryan',
    surname: 'O\'Neill',
    dateOfBirth: ISODate('2003-05-24T00:00:00.000Z'),
    email: 'ryan.oneill@students.example.ac.uk',
    level: 6,
    course: 'BSCCS',
    status: 'Active',
    registrations: [
      { module: 'COM748', date: ISODate('2026-09-24T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  },
  {
    _id: 1024,
    forename: 'Zara',
    surname: 'Malik',
    dateOfBirth: ISODate('2004-01-07T00:00:00.000Z'),
    email: 'zara.malik@students.example.ac.uk',
    mobile: '07700 900114',
    level: 6,
    course: 'BSCCS',
    status: 'Active',
    registrations: [
      { module: 'COM748', date: ISODate('2026-09-25T00:00:00.000Z'), semester: 'Semester 1' }
    ]
  }
]);

print('lecturers: ' + db.lecturers.countDocuments() + ', courses: ' + db.courses.countDocuments() + ', modules: ' + db.modules.countDocuments() + ', students: ' + db.students.countDocuments());
