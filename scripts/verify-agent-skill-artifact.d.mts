export declare function extractAgentSkillZip(archive: Buffer, targetRoot: string): Promise<string[]>;

export declare function verifyAgentSkillChecksum(zipPath: string, checksumPath: string): Promise<string>;
