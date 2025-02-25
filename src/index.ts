// This file serves as the entry point for the Azure Functions runtime
// It re-exports all functions from their respective files

import { pullRequestTrigger } from './functions/pullRequestTrigger';

// Export all functions
export { pullRequestTrigger };
