import { logEvent as firebaseLogEvent, setUserId, setUserProperties } from "firebase/analytics";
import { analytics } from "./firebase";

/**
 * Logs a custom event to Firebase Analytics.
 * @param eventName Name of the event.
 * @param eventParams Optional parameters for the event.
 */
export const logEvent = async (eventName: string, eventParams?: { [key: string]: any }) => {
  try {
    const instance = await analytics;
    if (instance) {
      firebaseLogEvent(instance, eventName, eventParams);
    }
  } catch (error) {
    console.error("Analytics error:", error);
  }
};

/**
 * Sets the user ID for analytics.
 * @param userId The unique ID for the user.
 */
export const identifyUser = async (userId: string) => {
  try {
    const instance = await analytics;
    if (instance) {
      setUserId(instance, userId);
    }
  } catch (error) {
    console.error("Analytics error:", error);
  }
};

/**
 * Sets custom user properties.
 * @param properties Key-value pairs of user properties.
 */
export const setUserData = async (properties: { [key: string]: any }) => {
  try {
    const instance = await analytics;
    if (instance) {
      setUserProperties(instance, properties);
    }
  } catch (error) {
    console.error("Analytics error:", error);
  }
};
