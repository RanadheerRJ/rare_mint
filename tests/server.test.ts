import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';

test('server starts empty and owner can enroll members', async () => {
  const previous = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), 'rare-mint-test-'));
  process.chdir(temp);
  const { initDatabase, db } = await import('../server/db');
  const { apiRouter } = await import('../server/routes');
  initDatabase();
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (path: string, body?: object) => {
    const response = await fetch(base + path, body ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : undefined);
    return { status: response.status, body: await response.json() as any };
  };
  try {
    assert.equal((db.prepare('SELECT count(*) AS count FROM users').get() as {count:number}).count, 0);
    const register = (name: string, phone: string) => call('/auth/register', {name, phone, pin:'4567', role:'organizer'});
    const owner = (await register('Owner','9000000001')).body.user;
    const other = (await register('Other','9000000002')).body.user;
    assert.deepEqual((await call(`/chits?userId=${owner.id}`)).body.groups, []);
    const group = (await call('/chits', {name:'Group', code:'TEST', chitType:'AUCTION', faceValue:40000, durationMonths:4, startDate:'2026-11-10', dueDayOfMonth:10, baseInstallment:10000, organizerId:owner.id})).body.group;
    const member = {ticketNumber:1, organizerId:owner.id, newMemberName:'Member', newMemberPhone:'9000000003', newMemberPin:'5678'};
    assert.equal((await call(`/chits/${group.id}/slots`, {...member, organizerId:other.id})).status, 403);
    assert.equal((await call(`/chits/${group.id}/slots`, {...member, ticketNumber:1.5})).status, 400);
    assert.equal((await call(`/chits/${group.id}/slots`, {...member, newMemberPin:'12'})).status, 400);
    const added = await call(`/chits/${group.id}/slots`, member);
    assert.equal(added.status, 201);
    assert.equal((await call('/auth/login', {phone:member.newMemberPhone, pin:member.newMemberPin})).body.user.id, added.body.slot.userId);
    assert.equal((await call(`/chits/${group.id}/slots`, member)).status, 409);
    assert.equal((await call(`/chits/${group.id}/slots`, {ticketNumber:2, organizerId:owner.id, userId:added.body.slot.userId})).status, 201);
    assert.equal((await call(`/chits?userId=${other.id}`)).body.groups.length, 0);
    assert.equal((await call(`/dues?userId=${owner.id}`)).body.dues.length, 2);
    assert.equal((await call(`/dues?userId=${other.id}`)).body.dues.length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    db.close();
    process.chdir(previous);
    rmSync(temp, {recursive:true, force:true});
  }
});
