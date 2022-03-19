const lib = require('lib')({token: process.env.STDLIB_SECRET_TOKEN});
const moment = require('moment-timezone');
const storedFunctions = require('../../../exported/storedFunctions.js');
const storedVariables = require('../../../exported/storedVariables.js');

const commentCreator = context.params.event.comment.user.login;
const commentBody = context.params.event.comment.body;
const issueNumber = context.params.event.issue.number;
const generalObject = storedFunctions.generalParams(issueNumber);
const now = moment();

// IF COMMENT concerning payout
if (commentBody.includes(storedVariables.payoutPhrase)) {
    console.log('PAYOUT REGISTERED');
    // try to pull data about previously stored transaction from cloudflare (solving failed transactions)
    let storedPull = await storedFunctions.getStoredData(
        process.env.CLDFLR_PULLS_NAMESPACE,
        issueNumber
    );
    // IF there is stored transaction
    if (storedPull.result !== null) {
        // PUSH new transaction into array of transactions bound to this PR
        prObject = storedFunctions.makePullObject(
            await storedFunctions.getPull(generalObject),
            commentBody
        );
        storedPull.transactions.push(prObject.transactions[0]);
        await storedFunctions.storeData(
            process.env.CLDFLR_PULLS_NAMESPACE,
            storedPull,
            issueNumber
        );
        // IF there is no stored transaction, store whole Pull Object with data described in readme.md
    } else {
        prObject = storedFunctions.makePullObject(
            await storedFunctions.getPull(generalObject),
            commentBody
        );
        await storedFunctions.storeData(
            process.env.CLDFLR_PULLS_NAMESPACE,
            prObject,
            issueNumber
        );
    }
}
// IF COMMENT created by ignoredUsers
else if (commentCreator in storedVariables.ignoredUsers) {
    console.log('COMMENT CREATED BY IGNORED USER');
    return true;
}

// IF COMMENT doesn't include goPhrase
else if (!storedVariables.goPhrases.includes(commentBody)) {
    console.log('COMMENT WITHOUT GO PHRASE');
    return true;

    // IF COMMENT includes goPhrase
} else {
    console.log('THERE WAS A GO PHRASE:', commentBody);
    let storedIssue = await storedFunctions.getStoredData(
        process.env.CLDFLR_ISSUES_NAMESPACE,
        issueNumber
    );
    // IF previous storedIssue EXISTS
    if (storedIssue.result !== null) {
        // IF PR was already opened
        if (storedIssue.prOpened !== '') {
            // COMMENT errorMessagePR
            await storedFunctions.createComment(
                generalObject,
                storedVariables.errorMessagePR(commentCreator, storedIssue.prOpened)
            );
            return;
        }
        // IF goPhrase author IS current assignee
        if (storedIssue.assignee === commentCreator) {
            // AND lockedPeriod continues
            if (now < moment(storedIssue.lockedPeriod)) {
                // COMMENT alreadyAssigned
                await storedFunctions.createComment(
                    generalObject,
                    storedVariables.alreadyAssigned(
                        commentCreator,
                        storedIssue.lockedPeriod
                    )
                );
                return;
                // AND lockedPeriod expired
            } else {
                // COMMENT cannotAssignAgain
                await storedFunctions.createComment(
                    generalObject,
                    storedVariables.cannotAssignAgain(
                        commentCreator,
                        storedIssue.lockedPeriod
                    )
                );
            }
            // IF goPhrase NOT current assignee
            // AND lockedPeriod continues
        } else if (now < moment(storedIssue.lockedPeriod)) {
            // COMMENT errorMessage
            await storedFunctions.createComment(
                generalObject,
                storedVariables.errorMessage(
                    storedIssue.assignee,
                    storedIssue.lockedPeriod
                )
            );
            return;
            // IF goPhrase NOT current assignee
            // AND lockedPeriod is over
        } else {
            await storedFunctions.storeAssignComment(
                generalObject,
                storedIssue,
                issueNumber,
                commentCreator,
                now
            );
        }
        // IF no storedIssue exists
    } else {
        await storedFunctions.storeAssignComment(
            generalObject,
            storedIssue,
            issueNumber,
            commentCreator,
            now
        );
    }
}
