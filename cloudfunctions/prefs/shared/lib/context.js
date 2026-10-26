'use strict';

const { fetchAll } = require('./fetch');
const { loadSupports } = require('./caller');

async function loadContext(db) {
  const [employees, rooms, supports] = await Promise.all([
    fetchAll(db.collection('employees')),
    fetchAll(db.collection('rooms')),
    loadSupports(db),
  ]);
  const people = new Map(
    employees
      .filter((person) => person.active !== false && person.status !== 'disabled')
      .map((person) => [person._id, person]),
  );
  const roomMap = new Map(
    rooms.filter((room) => room.active !== false).map((room) => [room._id, room]),
  );
  return {
    supports,
    isLeader: (personId) => people.get(personId) && people.get(personId).role === 'leader',
    personById: (personId) => people.get(personId) || null,
    roomById: (roomId) => roomMap.get(roomId) || null,
    employees,
    rooms,
  };
}

function activeEmployees(context) {
  return (context.employees || []).filter(
    (person) => person.active !== false && person.status !== 'disabled',
  );
}

module.exports = { activeEmployees, loadContext };
