"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSubscriptionUiState = exports.grantsAccess = void 0;
const ACCESS_GRANTING = new Set(['active', 'trialing', 'past_due']);
const grantsAccess = (subscription) => {
    if (!subscription)
        return false;
    return ACCESS_GRANTING.has(subscription.status);
};
exports.grantsAccess = grantsAccess;
const getSubscriptionUiState = (subscription) => {
    if (!subscription)
        return 'no-subscription';
    if (subscription.scheduled_change_action === 'cancel')
        return 'cancel-scheduled';
    if (subscription.scheduled_change_action === 'pause')
        return 'pause-scheduled';
    return subscription.status;
};
exports.getSubscriptionUiState = getSubscriptionUiState;
//# sourceMappingURL=subscription-access.js.map