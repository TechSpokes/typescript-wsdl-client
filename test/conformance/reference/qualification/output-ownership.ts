/** Hands copied qualification evidence to the host runner without widening private file modes.
 * @since 1.1.6
 * @constraints Only Node built-ins are available before the qualification dependency install.
 */
import { lchownSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface OutputOwner { readonly uid: number; readonly gid: number }

/** Parses the optional caller identity passed across the existing container boundary.
 * @param uid - Decimal host user identity; absent only when gid is also absent.
 * @param gid - Decimal host group identity; absent only when uid is also absent.
 * @returns The validated identity, or undefined for hosts without POSIX identities.
 * @throws TypeError For partial, noninteger or out-of-range identities, including the chown no-change sentinel.
 */
export function qualificationOutputOwner(uid: string | undefined, gid: string | undefined): OutputOwner | undefined {
    if (uid === undefined && gid === undefined) return undefined;
    const valid = (value: string | undefined): value is string => value !== undefined && /^(0|[1-9][0-9]*)$/.test(value)
        && Number.isSafeInteger(Number(value)) && Number(value) < 0xffffffff;
    if (!valid(uid) || !valid(gid)) throw new TypeError('Qualification output requires a valid host UID and GID');
    return {uid: Number(uid), gid: Number(gid)};
}

/** Changes ownership of a copied output tree without following links or modifying mode bits.
 * @param root - Copied evidence directory created by the caller, separate from the original checkout and sources.
 * @param owner - Validated host UID/GID from qualificationOutputOwner.
 * @param changeOwner - Link-preserving ownership primitive; injectable for portable filesystem boundary tests.
 * @returns Nothing after every copied inode has been handed off.
 * @throws When filesystem inspection or ownership transfer fails.
 * @sideEffects Changes ownership only within root, including link inodes rather than their targets.
 */
export function handOffQualificationOutput(root: string, owner: OutputOwner,
    changeOwner: (file: string, uid: number, gid: number) => void = lchownSync): void {
    const pending = [root];
    for (let index = 0; index < pending.length; index++) {
        const file = pending[index]!, stat = lstatSync(file);
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
            for (const name of readdirSync(file)) pending.push(join(file, name));
        }
        changeOwner(file, owner.uid, owner.gid);
    }
}
