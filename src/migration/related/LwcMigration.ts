/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as shell from 'shelljs';
import { FileUtil, File } from '../../utils/file/fileUtil';
import { sfProject } from '../../utils/sfcli/project/sfProject';
import { Logger } from '../../utils/logger';
import { FileProcessorFactory } from '../../utils/lwcparser/fileutils/FileProcessorFactory';
import { FileChangeInfo, LWCAssessmentInfo } from '../../utils';
import { Constants } from '../../utils/constants/stringContants';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

const LWC_DIR_PATH = '/force-app/main/default/lwc';
const LWCTYPE = 'LightningComponentBundle';

export class LwcMigration extends BaseRelatedObjectMigration {
  public processObjectType(): string {
    return Constants.LWC;
  }
  // public identifyObjects(migrationResults: MigrationResult[]): Promise<JSON[]> {
  //   this.assessment();
  //   throw new Error('Method not implemented.');
  // }
  // public migrateRelatedObjects(migrationResults: MigrationResult[], migrationCandidates: JSON[]): string[] {
  //   return this.mapToName(this.migrate());
  // }
  public assessment(): LWCAssessmentInfo[] {
    Logger.logVerbose(`Starting LWC assessment in project path: ${this.projectPath}`);
    const type = 'assessment';
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    sfProject.retrieve(LWCTYPE, this.org.getUsername());
    Logger.info('Processing LWCs for assessment');
    const filesMap = this.processLwcFiles(this.projectPath);
    Logger.info(`Successfully processed ${filesMap.size} LWCs for assessment`);
    Logger.logVerbose(`LWC assessment results: ${JSON.stringify(filesMap, null, 2)}`);
    shell.cd(pwd);
    return this.processFiles(filesMap, type);
  }

  public migrate(): LWCAssessmentInfo[] {
    Logger.logVerbose(`Starting LWC migration in project path: ${this.projectPath}`);
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    // const targetOrg: Org = this.org;
    // sfProject.retrieve(LWCTYPE, targetOrg.getUsername());
    Logger.info('Processing LWCs for migration');
    const filesMap = this.processLwcFiles(this.projectPath);
    const LWCAssessmentInfos = this.processFiles(filesMap, 'migration');
    Logger.info(`Successfully processed ${LWCAssessmentInfos.length} LWCs for migration`);
    Logger.logVerbose(`LWC migration results: ${JSON.stringify(LWCAssessmentInfos, null, 2)}`);
    // sfProject.deploy(LWCTYPE, targetOrg.getUsername());
    shell.cd(pwd);
    return LWCAssessmentInfos;
  }

  // This method is returning a Map of directory and list of file in directory
  private processLwcFiles(dir: string): Map<string, File[]> {
    dir += LWC_DIR_PATH;
    let filesMap: Map<string, File[]>;
    try {
      filesMap = FileUtil.readAndProcessFiles(dir, 'OmniScript Auto-generated');
    } catch (error) {
      Logger.error(`Error in reading files: ${String(error)}`);
    }
    return filesMap;
  }

  // This method to process the parsing and return the LWCAssessmentInfo[]
  private processFiles(fileMap: Map<string, File[]>, type: string): LWCAssessmentInfo[] {
    try {
      const jsonData: LWCAssessmentInfo[] = [];
      fileMap.forEach((fileList, dir) => {
        const changeInfos: FileChangeInfo[] = [];
        if (
          dir !== Constants.LWC &&
          !dir.endsWith('MultiLanguage') &&
          !dir.endsWith('English') &&
          !dir.includes('_') &&
          !dir.startsWith('cf') &&
          !dir.startsWith('Omniscript') &&
          !dir.includes('Util') &&
          !dir.includes('lodash')
        ) {
          for (const file of fileList) {
            if (this.isValideFile(file.name)) {
              const processor = FileProcessorFactory.getFileProcessor(file.ext);
              if (processor != null) {
                const path = file.location;
                const name = file.name + file.ext;
                const diff = processor.process(file, type, this.namespace);
                if (diff !== undefined && diff !== '[]') {
                  const fileInfo: FileChangeInfo = {
                    path,
                    name,
                    diff,
                  };
                  changeInfos.push(fileInfo);
                }
              }
            }
          }
          const name = dir;
          const errors: string[] = [];
          const assesmentInfo: LWCAssessmentInfo = {
            name,
            changeInfos,
            errors,
          };
          if (changeInfos && changeInfos.length > 0) {
            jsonData.push(assesmentInfo);
          }
        }
      });
      return jsonData;
    } catch (error) {
      Logger.error(`Error in processing files: ${String(error)}`);
    }
  }

  private isValideFile(filename: string): boolean {
    return !filename.includes('_def') && !filename.includes('styleDefinition') && !filename.includes('definition');
  }
}
