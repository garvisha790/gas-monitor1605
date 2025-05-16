// eventBusService.js - Simple event bus for cross-component communication
const eventBus = {
  listeners: {},
  
  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {function} callback - Event handler
   * @returns {function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    
    // Return unsubscribe function
    return () => {
      this.off(event, callback);
    };
  },
  
  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {function} callback - Event handler to remove
   */
  off(event, callback) {
    if (!this.listeners[event]) return;
    
    const index = this.listeners[event].indexOf(callback);
    if (index !== -1) {
      this.listeners[event].splice(index, 1);
    }
  },
  
  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    if (!this.listeners[event]) return;
    
    console.log(`📢 EventBus: Emitting '${event}' with data:`, data);
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error(`❌ Error in event handler for '${event}':`, err);
      }
    });
  }
};

export default eventBus;
