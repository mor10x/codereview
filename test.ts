import { addCommentToPullRequest, getPullRequest, getPullRequestChanges, getPullRequestComments } from "./src/services/azureDevOpsService";
import { doCodeReview } from "./src/services/codeReviewService";

const pullRequest = await getPullRequest(5975, "tomra.sitecore");
const fileChanges = await getPullRequestChanges(pullRequest);

const comments = await getPullRequestComments(pullRequest);

if (comments.length == 0) {
    const codeReview = await doCodeReview(pullRequest, fileChanges);

    await addCommentToPullRequest(pullRequest, codeReview);

} else {
    console.log("Pull request already has comments, skipping code review");
}
