import test from 'node:test';
import assert from 'node:assert/strict';
import {validGithubClaims} from '../supabase/functions/songbook-timeline-sync/core.js';
const claims={repository_id:'1366316295',repository_owner_id:'1607031',repository:'seirian/mir-cheongwoon-site',ref:'refs/heads/develop',event_name:'workflow_run',workflow_ref:'seirian/mir-cheongwoon-site/.github/workflows/songbook-timeline-backfill.yml@refs/heads/develop',runner_environment:'github-hosted',run_id:'37138949873',run_attempt:'2'};
test('verified hosted direct job may name the exact same workflow in job_workflow_ref',()=>{
 assert.equal(validGithubClaims(claims),true);
 assert.equal(validGithubClaims({...claims,job_workflow_ref:claims.workflow_ref}),true);
});
test('self-reference compatibility cannot authorize another workflow, repository or branch',()=>{
 const p={...claims,job_workflow_ref:claims.workflow_ref};
 for(const changed of [{job_workflow_ref:'external/repo/.github/workflows/run.yml@main'},{job_workflow_ref:claims.workflow_ref.replace('develop','main')},{repository_id:'1'},{ref:'refs/heads/feature/test'},{event_name:'pull_request'},{workflow_ref:claims.workflow_ref.replace('songbook-timeline-backfill','other')}])assert.equal(validGithubClaims({...p,...changed}),false);
});
