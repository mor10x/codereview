import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { doCodeReview } from "../services/codeReviewService";
import { addCommentToPullRequest, getPullRequest, getPullRequestChanges, getPullRequestComments, PullRequestComment } from "../services/azureDevOpsService";

interface PullRequestPayload {
  eventType: string;
  resource: {
    pullRequestId: number;
    repository: {
      id: string;
      project: {
        id: string;
      };
    };
  };
}

interface Comment {
  commentType: string | number;
  content?: string;
  id?: number;
  [key: string]: any;
}

interface CommentThread {
  comments: Comment[];
  id: number;
  [key: string]: any;
}

export async function pullRequestTrigger(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("Pull Request Webhook triggered");

  try {
    // Parse the webhook payload
    const payload = await request.json() as PullRequestPayload;

    // Check if this is a pull request created event
    if (payload.eventType !== "git.pullrequest.created") {
      return {
        status: 200,
        body: "Event ignored - not a pull request creation event"
      };
    }

    // Extract pull request details from the payload
    const pullRequestId = payload.resource.pullRequestId;
    const repositoryId = payload.resource.repository.id;
    const projectId = payload.resource.repository.project.id;

    context.log(`Processing pull request #${pullRequestId} in repository ${repositoryId}`);

    const pullRequest = await getPullRequest(pullRequestId, repositoryId);

    // Get pull request comments to check if it already has comments
    const comments = await getPullRequestComments(pullRequest);

    const hasTextComments = comments.length > 0;

    // If there are text comments, skip the code review
    if (hasTextComments) {
      context.log("Pull request already has text comments, skipping code review");
      return {
        status: 200,
        body: "Pull request already has text comments, skipping code review"
      };
    }

    context.log("Pull request has no text comments, proceeding with code review");

    const changes = await getPullRequestChanges(pullRequest);

    // Perform code review
    const codeReviewResult = await doCodeReview(pullRequest, changes);

    // Add the code review as a comment to the pull request
    if (codeReviewResult != "") {
      await addCommentToPullRequest(pullRequest, codeReviewResult);
      return {
        status: 200,
        body: "Code review completed and added as a comment"
      };
    }

    return {
      status: 200,
      body: "No changes to review"
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    context.error("Error processing pull request webhook:", error);
    return {
      status: 500,
      body: `Error processing pull request: ${errorMessage}`
    };
  }
}

app.http('pullRequestTrigger', {
  methods: ['POST'],
  authLevel: 'function',
  handler: pullRequestTrigger
});
