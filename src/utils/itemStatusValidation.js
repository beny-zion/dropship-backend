/**
 * Item Status Validation Utilities
 *
 * Validates status transitions and prevents invalid changes
 */

import { ITEM_STATUS, ITEM_STATUS_TRANSITIONS, ITEM_STATUS_LABELS } from '../constants/itemStatuses.js';

/**
 * Check if status transition is valid
 */
export function isValidStatusTransition(currentStatus, newStatus) {
  // If same status, it's valid (no change)
  if (currentStatus === newStatus) {
    return true;
  }

  const allowedTransitions = ITEM_STATUS_TRANSITIONS[currentStatus] || [];
  return allowedTransitions.includes(newStatus);
}

/**
 * Get allowed next statuses for current status
 */
export function getAllowedNextStatuses(currentStatus) {
  return ITEM_STATUS_TRANSITIONS[currentStatus] || [];
}

/**
 * Get validation error message
 */
export function getStatusTransitionError(currentStatus, newStatus) {
  const currentLabel = ITEM_STATUS_LABELS[currentStatus] || currentStatus;
  const newLabel = ITEM_STATUS_LABELS[newStatus] || newStatus;

  return `לא ניתן לעבור מסטטוס "${currentLabel}" לסטטוס "${newLabel}". המעבר הזה אינו מותר.`;
}

/**
 * Validate status transition and throw error if invalid
 */
export function validateStatusTransition(currentStatus, newStatus) {
  if (!isValidStatusTransition(currentStatus, newStatus)) {
    const error = new Error(getStatusTransitionError(currentStatus, newStatus));
    error.statusCode = 400;
    error.currentStatus = currentStatus;
    error.attemptedStatus = newStatus;
    error.allowedStatuses = getAllowedNextStatuses(currentStatus);
    throw error;
  }
  return true;
}

export default {
  isValidStatusTransition,
  getAllowedNextStatuses,
  getStatusTransitionError,
  validateStatusTransition
};
