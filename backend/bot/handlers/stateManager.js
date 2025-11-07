// Simple in-memory state manager
// In production, you might want to use Redis or database

const states = new Map();
const userData = new Map();

class StateManager {
  setState(userId, state, data = null) {
    states.set(userId, state);
    if (data !== null) {
      userData.set(userId, data);
    }
  }

  getState(userId) {
    return states.get(userId) || null;
  }

  getData(userId) {
    const data = userData.get(userId);
    const result = data || {};
    // Only log if we're actually looking for data (not empty checks)
    if (data && Object.keys(data).length > 0) {
      console.log(`StateManager getData: userId=${userId}, returning:`, result);
    }
    return result;
  }

  setData(userId, data) {
    const currentData = this.getData(userId);
    const mergedData = { ...currentData, ...data };
    userData.set(userId, mergedData);
    console.log(`StateManager setData: userId=${userId}, data=`, mergedData, 'stored:', userData.get(userId));
  }

  clearState(userId) {
    states.delete(userId);
    userData.delete(userId);
  }
}

module.exports = new StateManager();

