import { Messages } from '@salesforce/core';
import { Logger } from '../../logger';
import { cli } from '../../shell/cli';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'migrate');

export class sfProject {
  public static create(name: string, outputDir?: string): void {
    Logger.log(messages.getMessage('creatingProject', [name]));
    const cmd = `sf project generate --name ${name}${outputDir ? ` --output-dir ${outputDir}` : ''}`;
    sfProject.executeCommand(cmd);
    Logger.log(messages.getMessage('projectCreated', [name]));
  }

  public static retrieve(metadataName: string, username: string): void {
    Logger.log(messages.getMessage('retrievingMetadata', [metadataName, username]));
    const cmd = `sf project retrieve start --metadata ${metadataName} --target-org ${username}`;
    sfProject.executeCommand(cmd);
    Logger.log(messages.getMessage('metadataRetrieved', [metadataName, username]));
  }

  public static deploy(metadataName: string, username: string): void {
    Logger.log(messages.getMessage('deployingMetadata', [metadataName, username]));
    const cmd = `sf project deploy start --metadata ${metadataName} --target-org ${username}`;
    sfProject.executeCommand(cmd);
    Logger.log(messages.getMessage('metadataDeployed', [metadataName, username]));
  }

  private static executeCommand(cmd: string): void {
    try {
      cli.exec(`${cmd} --json > /dev/null 2>&1`);
    } catch (error) {
      Logger.error(messages.getMessage('sfProjectCommandError', [String(error)]));
      throw error;
    }
  }
}
