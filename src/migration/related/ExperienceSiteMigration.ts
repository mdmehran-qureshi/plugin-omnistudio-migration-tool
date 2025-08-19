import * as fs from 'fs';
import * as path from 'path';
import * as shell from 'shelljs';
import { Org, Messages } from '@salesforce/core';
import { FileUtil, File } from '../../utils/file/fileUtil';
import { Logger } from '../../utils/logger';
import { Constants } from '../../utils/constants/stringContants';
import {
  ExpSiteComponent,
  ExpSiteComponentAttributes,
  MigrationStorage,
  OmniScriptStorage,
  ExpSitePageJson,
  Storage,
  ExpSiteRegion,
  FlexcardStorage,
} from '../interfaces';
import { FileDiffUtil } from '../../utils/lwcparser/fileutils/FileDiffUtil';
import { ExperienceSiteAssessmentInfo } from '../../utils';
import { StorageUtil } from '../../utils/storageUtil';
import { createProgressBar } from '../base';
import { BaseRelatedObjectMigration } from './BaseRealtedObjectMigration';

Messages.importMessagesDirectory(__dirname);

const TARGET_COMPONENT_NAME_OS = 'runtime_omnistudio:omniscript';
const TARGET_COMPONENT_NAME_FC = 'runtime_omnistudio:flexcard';
const FLEXCARD_PREFIX = 'cf';

export class ExperienceSiteMigration extends BaseRelatedObjectMigration {
  private EXPERIENCE_SITES_PATH: string;
  private MIGRATE = 'Migrate';
  private ASSESS = 'Assess';
  private messages: Messages;

  public constructor(projectPath: string, namespace: string, org: Org, messages: Messages) {
    super(projectPath, namespace, org);
    this.messages = messages;
  }

  public processObjectType(): string {
    return Constants.ExpSites;
  }

  public assess(): ExperienceSiteAssessmentInfo[] {
    return this.process(this.ASSESS);
  }

  public migrate(): ExperienceSiteAssessmentInfo[] {
    return this.process(this.MIGRATE);
  }

  public process(type: string): ExperienceSiteAssessmentInfo[] {
    Logger.logVerbose(this.messages.getMessage('processingExperienceSites', [type]));
    const pwd = shell.pwd();
    shell.cd(this.projectPath);
    this.EXPERIENCE_SITES_PATH = path.join(this.projectPath, 'force-app', 'main', 'default', 'experiences');

    Logger.logVerbose(this.messages.getMessage('experienceSitesProcessingStarted'));
    const experienceSiteInfo = this.processExperienceSites(this.EXPERIENCE_SITES_PATH, type);
    Logger.info(this.messages.getMessage('experienceSiteSuccessfullyProcessed', [type]));
    shell.cd(pwd);
    return experienceSiteInfo;
  }

  public processExperienceSites(dir: string, type: string): ExperienceSiteAssessmentInfo[] {
    Logger.logVerbose(this.messages.getMessage('readingFile'));
    const count = { total: 0 };
    const directoryMap: Map<string, File[]> = FileUtil.getAllFilesInsideDirectory(dir, count, '.json');
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    Logger.logVerbose(this.messages.getMessage('totalFileCount', [count.total]));

    // TODO - IF directory is empty
    let progressCounter = 0;
    const progressBar = createProgressBar(type, 'ExperienceSites');
    progressBar.start(count.total, progressCounter);

    const experienceSitesAssessmentInfo: ExperienceSiteAssessmentInfo[] = [];
    Logger.logVerbose('The namespace for expsites processing is ' + this.namespace);
    for (const directory of directoryMap.keys()) {
      const fileArray = directoryMap.get(directory);
      if (!fileArray) {
        continue;
      }
      for (const file of fileArray) {
        progressBar.update(++progressCounter);
        if (file.ext !== '.json') {
          Logger.logVerbose(this.messages.getMessage('skipNonJsonFile ', [file.name]));
          continue;
        }
        try {
          const experienceSiteInfo = this.processExperienceSite(file, type);
          if (experienceSiteInfo?.hasOmnistudioContent === true) {
            Logger.logVerbose(this.messages.getMessage('experienceSiteWithOmniWrapperSuccessfullyProcessed'));
            experienceSitesAssessmentInfo.push(experienceSiteInfo);
          } else {
            Logger.logVerbose(this.messages.getMessage('fileNotHavingWrapper'));
          }
        } catch (err) {
          this.populateExceptionInfo(file, experienceSitesAssessmentInfo);
          Logger.error(this.messages.getMessage('errorProcessingExperienceSite', [file.name]));
          Logger.error(JSON.stringify(err));
        }
      }
    }

    Logger.logVerbose(this.messages.getMessage('experienceSiteReportingDetails'));
    progressBar.stop();
    return experienceSitesAssessmentInfo;
  }

  public processExperienceSite(file: File, type: string): ExperienceSiteAssessmentInfo {
    Logger.logVerbose(this.messages.getMessage('processingFile', [file.name]));

    const experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo = {
      name: file.name,
      warnings: [],
      errors: [],
      infos: [],
      path: file.location,
      diff: JSON.stringify([]),
      hasOmnistudioContent: false,
      status: type === this.ASSESS ? 'Ready for migration' : 'Successfully migrated',
    };

    const lookupComponentName = `${this.namespace}:vlocityLWCOmniWrapper`;
    const fileContent = fs.readFileSync(file.location, 'utf8');
    // TODO - undefined check here
    const experienceSiteParsedJSON = JSON.parse(fileContent) as ExpSitePageJson;
    const normalizedOriginalFileContent = JSON.stringify(experienceSiteParsedJSON, null, 2);
    const regions: ExpSiteRegion[] = experienceSiteParsedJSON.regions;

    // TODO - When will it be Flexcard

    if (regions === undefined) {
      experienceSiteAssessmentInfo.hasOmnistudioContent = false;
      return experienceSiteAssessmentInfo;
    }

    let storage: MigrationStorage;

    if (type === this.MIGRATE) {
      storage = StorageUtil.getOmnistudioMigrationStorage();
    } else {
      storage = StorageUtil.getOmnistudioAssessmentStorage();
    }

    for (const region of regions) {
      this.processRegion(region, experienceSiteAssessmentInfo, storage, lookupComponentName, type);
    }

    Logger.logVerbose(this.messages.getMessage('printUpdatedObject', [JSON.stringify(experienceSiteParsedJSON)]));

    const noarmalizeUpdatedFileContent = JSON.stringify(experienceSiteParsedJSON, null, 2); // Pretty-print with 2 spaces
    const difference = new FileDiffUtil().getFileDiff(
      file.name,
      normalizedOriginalFileContent,
      noarmalizeUpdatedFileContent
    );

    Logger.logVerbose(this.messages.getMessage('printDifference', [JSON.stringify(difference)]));

    if (type === this.MIGRATE && normalizedOriginalFileContent !== noarmalizeUpdatedFileContent) {
      Logger.logVerbose(this.messages.getMessage('updatingFile'));
      fs.writeFileSync(file.location, noarmalizeUpdatedFileContent, 'utf8');
    }

    experienceSiteAssessmentInfo.diff = JSON.stringify(difference);

    return experienceSiteAssessmentInfo;
  }

  private populateExceptionInfo(file: File, experienceSiteAssessmentInfos: ExperienceSiteAssessmentInfo[]): void {
    try {
      const experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo = {
        name: file.name,
        warnings: ['Unknown error occurred'],
        errors: [''],
        infos: [],
        path: file.location,
        diff: JSON.stringify([]),
        hasOmnistudioContent: false,
        status: 'Failed',
      };

      experienceSiteAssessmentInfos.push(experienceSiteAssessmentInfo);
    } catch {
      Logger.error(this.messages.getMessage('experienceSiteException'));
    }
  }

  private processRegion(
    region: ExpSiteRegion,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo,
    storage: MigrationStorage,
    lookupComponentName: string,
    type: string
  ): void {
    Logger.logVerbose(this.messages.getMessage('currentRegionOfExperienceSite', [JSON.stringify(region)]));

    const regionComponents: ExpSiteComponent[] = region.components;

    if (regionComponents === undefined) {
      return;
    }

    if (Array.isArray(regionComponents)) {
      for (const component of regionComponents) {
        this.processComponent(component, experienceSiteAssessmentInfo, storage, lookupComponentName, type);
      }
    }
  }

  private processComponent(
    component: ExpSiteComponent,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo,
    storage: MigrationStorage,
    lookupComponentName: string,
    type: string
  ): void {
    if (component === undefined || component === null) {
      return;
    }

    if (component.componentName === lookupComponentName) {
      Logger.logVerbose(this.messages.getMessage('omniWrapperFound'));
      experienceSiteAssessmentInfo.hasOmnistudioContent = true;

      this.updateComponentAndItsAttributes(
        component,
        component.componentAttributes,
        experienceSiteAssessmentInfo,
        storage,
        type
      );

      return;
    }

    const regionsInsideComponent: ExpSiteRegion[] = component.regions;

    if (Array.isArray(regionsInsideComponent)) {
      for (const region of regionsInsideComponent) {
        this.processRegion(region, experienceSiteAssessmentInfo, storage, lookupComponentName, type);
      }
    }
  }

  private updateComponentAndItsAttributes(
    component: ExpSiteComponent,
    currentAttribute: ExpSiteComponentAttributes,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo,
    storage: MigrationStorage,
    type: string
  ): void {
    if (component === undefined || currentAttribute === undefined) {
      return;
    }

    if (currentAttribute.target === undefined || currentAttribute.target === '') {
      experienceSiteAssessmentInfo.warnings.push(this.messages.getMessage('emptyTargetData'));
      experienceSiteAssessmentInfo.status = type === this.ASSESS ? 'Needs Manual Intervention' : 'Skipped';
      return;
    }

    const targetName = currentAttribute.target.substring(currentAttribute.target.indexOf(':') + 1); // c:ABCD -> ABCD

    if (targetName.startsWith(FLEXCARD_PREFIX)) {
      this.processFCComponent(targetName, component, currentAttribute, experienceSiteAssessmentInfo, storage, type);
    } else {
      this.processOSComponent(targetName, component, currentAttribute, experienceSiteAssessmentInfo, storage, type);
    }
    Logger.logVerbose('updatedComponentAttribute = ' + JSON.stringify(currentAttribute));
  }

  private processFCComponent(
    targetName: string,
    component: ExpSiteComponent,
    currentAttribute: ExpSiteComponentAttributes,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo,
    storage: MigrationStorage,
    type: string
  ): void {
    Logger.logVerbose(this.messages.getMessage('processingFlexcardComponent', [JSON.stringify(component)]));
    const flexcardName = targetName.substring(2); // cfCardName -> CardName
    const targetDataFromStorageFC: FlexcardStorage = storage.fcStorage.get(flexcardName.toLowerCase());

    Logger.logVerbose(this.messages.getMessage('targetData', [JSON.stringify(targetDataFromStorageFC)]));

    // Remove later
    if (this.shouldAddWarning(targetDataFromStorageFC)) {
      const warningMsg: string = this.getWarningMessage(flexcardName, targetDataFromStorageFC);
      experienceSiteAssessmentInfo.warnings.push(warningMsg);
      experienceSiteAssessmentInfo.status = type === this.ASSESS ? 'Needs Manual Intervention' : 'Skipped';
    } else {
      component.componentName = TARGET_COMPONENT_NAME_FC;

      const keysToDelete = ['target', 'layout', 'params', 'standalone'];

      keysToDelete.forEach((key) => delete currentAttribute[key]);

      currentAttribute['flexcardName'] = targetDataFromStorageFC.name;
      currentAttribute['objectApiName'] = '{!objectApiName}';
      currentAttribute['recordId'] = '{!recordId}';
    }
  }

  private processOSComponent(
    targetName: string,
    component: ExpSiteComponent,
    currentAttribute: ExpSiteComponentAttributes,
    experienceSiteAssessmentInfo: ExperienceSiteAssessmentInfo,
    storage: MigrationStorage,
    type: string
  ): void {
    Logger.logVerbose(this.messages.getMessage('processingOmniscriptComponent', [JSON.stringify(component)]));
    // Use storage to find the updated properties
    const targetDataFromStorage: OmniScriptStorage = storage.osStorage.get(targetName.toLowerCase());
    Logger.logVerbose(this.messages.getMessage('targetData', [JSON.stringify(targetDataFromStorage)]));

    if (this.shouldAddWarning(targetDataFromStorage)) {
      const warningMsg: string = this.getWarningMessage(targetName, targetDataFromStorage);
      experienceSiteAssessmentInfo.warnings.push(warningMsg);
      experienceSiteAssessmentInfo.status = type === this.ASSESS ? 'Needs Manual Intervention' : 'Skipped';
    } else {
      component.componentName = TARGET_COMPONENT_NAME_OS;

      // Preserve the layout value before clearing
      const originalLayout = currentAttribute['layout'];

      // Clear existing properties more safely - preserve any properties we don't want to delete
      const keysToDelete = ['layout', 'params', 'standAlone', 'target'];
      keysToDelete.forEach((key) => delete currentAttribute[key]);

      currentAttribute['direction'] = 'ltr';
      currentAttribute['display'] = 'Display OmniScript on page';
      currentAttribute['inlineVariant'] = 'brand';
      currentAttribute['language'] =
        targetDataFromStorage.language === undefined ? 'English' : targetDataFromStorage.language;
      currentAttribute['subType'] = targetDataFromStorage.subtype;
      currentAttribute['theme'] = originalLayout;
      currentAttribute['type'] = targetDataFromStorage.type;
    }
  }

  private shouldAddWarning(targetData: Storage): boolean {
    return targetData === undefined || targetData.migrationSuccess === false || targetData.isDuplicate === true;
  }

  private getWarningMessage(oldTypeSubtypeLanguage: string, targetDataFromStorage: Storage): string {
    if (targetDataFromStorage === undefined) {
      // Add log verbose
      return this.messages.getMessage('manualInterventionForExperienceSite', [oldTypeSubtypeLanguage]);
    } else if (targetDataFromStorage.migrationSuccess === false) {
      return this.messages.getMessage('manualInterventionForExperienceSiteAsFailure', [oldTypeSubtypeLanguage]);
    } else {
      return this.messages.getMessage('manualInterventionForExperienceSiteAsDuplicateKey', [oldTypeSubtypeLanguage]);
    }
  }
}
