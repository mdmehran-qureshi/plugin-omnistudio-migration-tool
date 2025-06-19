import { Logger } from '../../logger';
import { cli } from '../../shell/cli';

export class sfProject {
  public static create(name: string, outputDir?: string): void {
    Logger.log(`Creating project ${name}`);
    const cmd = `sf project generate --name ${name}${outputDir ? ` --output-dir ${outputDir}` : ''}`;
    sfProject.executeCommand(cmd);
    Logger.log(`Project ${name} created`);
  }

  public static retrieve(metadataName: string, username: string): void {
    Logger.log(`Retrieving metadata ${metadataName} from ${username}`);
    const cmd = `sf project retrieve start --metadata ${metadataName} --target-org ${username}`;
    sfProject.executeCommand(cmd);
    Logger.log(`Metadata ${metadataName} retrieved from ${username}`);
  }

  public static deploy(metadataName: string, username: string): void {
    Logger.log(`Deploying metadata ${metadataName} to ${username}`);
    const cmd = `sf project deploy start --metadata ${metadataName} --target-org ${username}`;
    sfProject.executeCommand(cmd);
    Logger.log(`Metadata ${metadataName} deployed to ${username}`);
  }

  private static executeCommand(cmd: string): void {
    try {
      cli.exec(`${cmd} --json > /dev/null 2>&1`);
    } catch (error) {
      Logger.error(error);
      throw error;
    }
  }
}
