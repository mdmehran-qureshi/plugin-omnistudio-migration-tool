/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as os from 'os';
import { flags } from '@salesforce/command';
import { Connection, Messages } from '@salesforce/core';
import OmniStudioBaseCommand from '../../basecommand';
import { DataRaptorMigrationTool } from '../../../migration/dataraptor';
import { DebugTimer, MigratedObject, MigratedRecordInfo } from '../../../utils';
import { InvalidEntityTypeError, MigrationResult, MigrationTool } from '../../../migration/interfaces';
import { ResultsBuilder } from '../../../utils/resultsbuilder';
import { CardMigrationTool } from '../../../migration/flexcard';
import { OmniScriptExportType, OmniScriptMigrationTool } from '../../../migration/omniscript';
import { CustomLabelsMigrationTool } from '../../../migration/customLabels';
import { Logger } from '../../../utils/logger';
import OmnistudioRelatedObjectMigrationFacade from '../../../migration/related/OmnistudioRelatedObjectMigrationFacade';
import { generatePackageXml } from '../../../utils/generatePackageXml';
import { OmnistudioOrgDetails, OrgUtils } from '../../../utils/orgUtils';
import { Constants } from '../../../utils/constants/stringContants';
import { OrgPreferences } from '../../../utils/orgPreferences';
import { ProjectPathUtil } from '../../../utils/projectPathUtil';
import { PromptUtil } from '../../../utils/promptUtil';
import { YES_SHORT, YES_LONG, NO_SHORT, NO_LONG } from '../../../utils/projectPathUtil';
import { PostMigrate } from '../../../migration/postMigrate';
import { PreMigrate } from '../../../migration/premigrate';
import { GlobalAutoNumberMigrationTool } from '../../../migration/globalautonumber';
import { NameMappingRegistry } from '../../../migration/NameMappingRegistry';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'migrate');

export default class Migrate extends OmniStudioBaseCommand {
  public static description = messages.getMessage('commandDescription');

  public static examples = messages.getMessage('examples').split(os.EOL);

  public static args = [{ name: 'file' }];

  protected static flagsConfig = {
    only: flags.string({
      char: 'o',
      description: messages.getMessage('onlyFlagDescription'),
    }),
    allversions: flags.boolean({
      char: 'a',
      description: messages.getMessage('allVersionsDescription'),
      required: false,
    }),
    relatedobjects: flags.string({
      char: 'r',
      description: messages.getMessage('relatedObjectGA'),
    }),
    verbose: flags.builtin({
      type: 'builtin',
      description: 'Enable verbose output',
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async run(): Promise<any> {
    Logger.initialiseLogger(this.ux, this.logger, 'migrate', this.flags.verbose);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return await this.runMigration();
    } catch (e) {
      const error = e as Error;
      Logger.error(messages.getMessage('errorRunningMigrate', [error.message]));
      process.exit(1);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async runMigration(): Promise<any> {
    const migrateOnly = (this.flags.only || '') as string;
    const allVersions = this.flags.allversions || (false as boolean);
    const relatedObjects = (this.flags.relatedobjects || '') as string;
    // this.org is guaranteed because requiresUsername=true, as opposed to supportsUsername
    const conn = this.org.getConnection();
    const apiVersion = conn.getApiVersion();

    const orgs: OmnistudioOrgDetails = await OrgUtils.getOrgDetails(conn);

    if (!orgs.hasValidNamespace) {
      Logger.warn(messages.getMessage('invalidNamespace') + orgs.packageDetails.namespace);
    }

    if (!orgs.packageDetails) {
      Logger.error(messages.getMessage('noPackageInstalled'));
      return;
    }
    if (orgs.omniStudioOrgPermissionEnabled) {
      Logger.error(messages.getMessage('alreadyStandardModel'));
      return;
    }

    // Enable Omni preferences
    try {
      orgs.rollbackFlags = await OrgPreferences.checkRollbackFlags(conn);
      await OrgPreferences.enableOmniPreferences(conn);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      Logger.log(`Could not enable Omni preferences: ${errMsg}`);
    }

    // check for confirmation over assessed action items
    const migrationConsent = await this.getMigrationConsent();
    if (!migrationConsent) {
      Logger.log(messages.getMessage('migrationConsentNotGiven'));
      return;
    }

    const namespace = orgs.packageDetails.namespace;
    // Let's time every step
    DebugTimer.getInstance().start();
    let projectPath: string;
    let objectsToProcess: string[] = [];
    let targetApexNamespace: string;
    const preMigrate: PreMigrate = new PreMigrate(namespace, conn, this.logger, messages, this.ux);
    const isExperienceBundleMetadataAPIProgramaticallyEnabled: { value: boolean } = { value: false };

    let actionItems = [];

    let deploymentConfig = { autoDeploy: false, authKey: undefined };
    if (relatedObjects) {
      const relatedObjectProcessResult = await this.processRelatedObjects(
        relatedObjects,
        preMigrate,
        conn,
        isExperienceBundleMetadataAPIProgramaticallyEnabled,
        actionItems
      );
      objectsToProcess = relatedObjectProcessResult.objectsToProcess;
      projectPath = relatedObjectProcessResult.projectPath;
      targetApexNamespace = relatedObjectProcessResult.targetApexNamespace;
      deploymentConfig = relatedObjectProcessResult.deploymentConfig;
    }

    Logger.log(messages.getMessage('migrationInitialization', [String(namespace)]));
    Logger.log(messages.getMessage('apiVersionInfo', [apiVersion]));
    Logger.logVerbose(messages.getMessage('migrationTargets', [migrateOnly || 'all']));
    Logger.logVerbose(messages.getMessage('relatedObjectsInfo', [relatedObjects || 'none']));
    Logger.logVerbose(messages.getMessage('allVersionsFlagInfo', [String(allVersions)]));

    // Initialize the name mapping registry and pre-process all components
    const nameRegistry = NameMappingRegistry.getInstance();
    nameRegistry.clear(); // Clear any previous mappings

    Logger.log(messages.getMessage('startingComponentPreProcessing'));
    await this.preProcessAllComponents(namespace, conn, migrateOnly);

    // Register the migration objects with CORRECTED ORDER
    let migrationObjects: MigrationTool[] = [];
    migrationObjects = this.getMigrationObjectsInCorrectOrder(
      migrateOnly,
      migrationObjects,
      namespace,
      conn,
      allVersions
    );

    // Migrate individual objects
    const debugTimer = DebugTimer.getInstance();
    // We need to truncate the standard objects first (in reverse order for cleanup)
    let objectMigrationResults = await this.truncateObjects([...migrationObjects].reverse(), debugTimer);
    const allTruncateComplete = objectMigrationResults.length === 0;

    // Log truncation errors if any exist
    if (!allTruncateComplete) {
      this.logTruncationErrors(objectMigrationResults);
      return;
    }

    if (allTruncateComplete) {
      objectMigrationResults = await this.migrateObjects(migrationObjects, debugTimer, namespace);
    }

    const omnistudioRelatedObjectsMigration = new OmnistudioRelatedObjectMigrationFacade(
      namespace,
      migrateOnly,
      allVersions,
      this.org,
      projectPath,
      targetApexNamespace
    );
    const relatedObjectMigrationResult = omnistudioRelatedObjectsMigration.migrateAll(objectsToProcess);

    // POST MIGRATION

    const postMigrate: PostMigrate = new PostMigrate(
      this.org,
      namespace,
      conn,
      this.logger,
      messages,
      this.ux,
      objectsToProcess,
      deploymentConfig,
      projectPath
    );

    if (!migrateOnly) {
      await postMigrate.executeTasks(namespace, actionItems);
    }
    // From here also actionItems need to be collected
    await postMigrate.restoreExperienceAPIMetadataSettings(
      isExperienceBundleMetadataAPIProgramaticallyEnabled,
      actionItems
    );

    const migrationActionItems = this.collectActionItems(objectMigrationResults);
    actionItems = [...actionItems, ...migrationActionItems];

    generatePackageXml.createChangeList(
      relatedObjectMigrationResult.apexAssessmentInfos,
      deploymentConfig.autoDeploy && deploymentConfig.authKey ? relatedObjectMigrationResult.lwcAssessmentInfos : [],
      relatedObjectMigrationResult.experienceSiteAssessmentInfos,
      relatedObjectMigrationResult.flexipageAssessmentInfos,
      this.org.getConnection().version,
      messages
    );

    try {
      postMigrate.deploy();
    } catch (error) {
      Logger.error(messages.getMessage('errorDeployingComponents'), error);
      Logger.logVerbose(error);
    }

    await ResultsBuilder.generateReport(
      objectMigrationResults,
      relatedObjectMigrationResult,
      conn.instanceUrl,
      orgs,
      messages,
      actionItems,
      objectsToProcess
    );

    // Return results needed for --json flag
    return { objectMigrationResults: [] };
  }

  private async processRelatedObjects(
    relatedObjects: string,
    preMigrate: PreMigrate,
    conn: Connection,
    isExperienceBundleMetadataAPIProgramaticallyEnabled: { value: boolean },
    actionItems: string[]
  ): Promise<{
    objectsToProcess: string[];
    projectPath: string;
    targetApexNamespace: string;
    deploymentConfig: { autoDeploy: boolean; authKey: string | undefined };
  }> {
    const validOptions = [Constants.Apex, Constants.ExpSites, Constants.FlexiPage, Constants.LWC];
    const objectsToProcess = relatedObjects.split(',').map((obj) => obj.trim());
    // Validate input
    for (const obj of objectsToProcess) {
      if (!validOptions.includes(obj)) {
        Logger.error(messages.getMessage('invalidRelatedObjectsOption', [obj]));
        process.exit(1);
      }
    }

    let deploymentConfig = { autoDeploy: false, authKey: undefined };
    let projectPath: string;
    let targetApexNamespace: string;
    // Check for general consent to make modifications with OMT
    const generalConsent = await this.getGeneralConsent();
    if (generalConsent) {
      // Use ProjectPathUtil for APEX project folder selection (matches assess.ts logic)
      projectPath = await ProjectPathUtil.getProjectPath(messages, true);
      targetApexNamespace = await this.getTargetApexNamespace(objectsToProcess, targetApexNamespace);
      await preMigrate.handleExperienceSitePrerequisites(
        objectsToProcess,
        conn,
        isExperienceBundleMetadataAPIProgramaticallyEnabled
      );
      deploymentConfig = await preMigrate.getAutoDeployConsent(objectsToProcess.includes(Constants.LWC), actionItems);
    } else {
      objectsToProcess.length = 0;
      Logger.warn(messages.getMessage('relatedObjectsConsentNotGiven'));
      Logger.logVerbose(messages.getMessage('relatedObjectsToProcess', [JSON.stringify(objectsToProcess)]));
    }

    return { objectsToProcess, projectPath, targetApexNamespace, deploymentConfig };
  }

  private async getMigrationConsent(): Promise<boolean> {
    const askWithTimeOut = PromptUtil.askWithTimeOut(messages);
    let validResponse = false;
    let consent = false;

    while (!validResponse) {
      try {
        const resp = await askWithTimeOut(Logger.prompt.bind(Logger), messages.getMessage('migrationConsentMessage'));
        const response = typeof resp === 'string' ? resp.trim().toLowerCase() : '';

        if (response === YES_SHORT || response === YES_LONG) {
          consent = true;
          validResponse = true;
        } else if (response === NO_SHORT || response === NO_LONG) {
          consent = false;
          validResponse = true;
        } else {
          Logger.error(messages.getMessage('invalidYesNoResponse'));
        }
      } catch (err) {
        Logger.error(messages.getMessage('requestTimedOut'));
        process.exit(1);
      }
    }

    return consent;
  }

  private collectActionItems(objectMigrationResults: MigratedObject[]): string[] {
    const actionItems: string[] = [];
    // Collect errors from migration results and add them to action items
    for (const result of objectMigrationResults) {
      if (result.errors && result.errors.length > 0) {
        actionItems.push(...result.errors);
      }
    }

    return actionItems;
  }

  private async truncateObjects(migrationObjects: MigrationTool[], debugTimer: DebugTimer): Promise<MigratedObject[]> {
    const objectMigrationResults: MigratedObject[] = [];
    // Truncate in reverse order (highest dependencies first) - this is correct for cleanup
    for (const cls of migrationObjects) {
      try {
        Logger.log(messages.getMessage('cleaningComponent', [cls.getName()]));
        debugTimer.lap('Cleaning: ' + cls.getName());
        await cls.truncate();
        Logger.log(messages.getMessage('cleaningDone', [cls.getName()]));
      } catch (ex: any) {
        objectMigrationResults.push({
          name: cls.getName(),
          data: [],
          errors: [ex.message],
        });
        Logger.logVerbose(ex.stack);
        Logger.error(messages.getMessage('cleaningFailed', [cls.getName()]));
      }
    }
    return objectMigrationResults;
  }

  private async migrateObjects(
    migrationObjects: MigrationTool[],
    debugTimer: DebugTimer,
    namespace: string
  ): Promise<MigratedObject[]> {
    let objectMigrationResults: MigratedObject[] = [];
    // Migrate in correct dependency order
    for (const cls of migrationObjects) {
      try {
        Logger.log(messages.getMessage('migratingComponent', [cls.getName()]));
        debugTimer.lap('Migrating: ' + cls.getName());
        const results = await cls.migrate();
        if (results.some((result) => result?.errors?.length > 0)) {
          Logger.error(messages.getMessage('migrationFailed', [cls.getName()]));
        } else {
          Logger.log(messages.getMessage('migrationCompleted', [cls.getName()]));
        }
        objectMigrationResults = objectMigrationResults.concat(
          results.map((r) => {
            return {
              name: r.name,
              data: this.mergeRecordAndUploadResults(r, cls),
              errors: r.errors,
            };
          })
        );
      } catch (ex: any) {
        if (ex instanceof InvalidEntityTypeError) {
          Logger.error(messages.getMessage('invalidTypeMigrateErrorMessage', [namespace]));
          process.exit(1);
        }
        const errMsg = ex instanceof Error ? ex.message : String(ex);
        Logger.error(messages.getMessage('errorMigrationMessage', [errMsg]));
        Logger.logVerbose(ex);
        objectMigrationResults.push({
          name: cls.getName(),
          data: [],
          errors: [errMsg],
        });
      }
    }
    return objectMigrationResults;
  }

  /**
   * Get migration objects in the correct dependency order:
   * 1. DataMappers (lowest dependencies)
   * 2. Integration Procedures/ OmniScripts
   * 3. FlexCards (highest dependencies)
   * 4. GlobalAutoNumbers (independent)
   */
  private getMigrationObjectsInCorrectOrder(
    migrateOnly: string,
    migrationObjects: MigrationTool[],
    namespace: string,
    conn: any,
    allVersions: any
  ): MigrationTool[] {
    if (!migrateOnly) {
      migrationObjects = [
        new DataRaptorMigrationTool(namespace, conn, this.logger, messages, this.ux),
        // Integration Procedure
        new OmniScriptMigrationTool(
          OmniScriptExportType.IP,
          namespace,
          conn,
          this.logger,
          messages,
          this.ux,
          allVersions
        ),
        // OmniScript
        new OmniScriptMigrationTool(
          OmniScriptExportType.OS,
          namespace,
          conn,
          this.logger,
          messages,
          this.ux,
          allVersions
        ),
        new CardMigrationTool(namespace, conn, this.logger, messages, this.ux, allVersions),
        new GlobalAutoNumberMigrationTool(namespace, conn, this.logger, messages, this.ux),
        new CustomLabelsMigrationTool(namespace, conn, this.logger, messages, this.ux),
      ];
    } else {
      // For single component migration, the order doesn't matter as much
      // but we still maintain consistency
      switch (migrateOnly) {
        case Constants.Omniscript:
          migrationObjects.push(
            new OmniScriptMigrationTool(
              OmniScriptExportType.OS,
              namespace,
              conn,
              this.logger,
              messages,
              this.ux,
              allVersions
            )
          );
          break;
        case Constants.IntegrationProcedure:
          migrationObjects.push(
            new OmniScriptMigrationTool(
              OmniScriptExportType.IP,
              namespace,
              conn,
              this.logger,
              messages,
              this.ux,
              allVersions
            )
          );
          break;
        case Constants.Flexcard:
          migrationObjects.push(new CardMigrationTool(namespace, conn, this.logger, messages, this.ux, allVersions));
          break;
        case Constants.DataMapper:
          migrationObjects.push(new DataRaptorMigrationTool(namespace, conn, this.logger, messages, this.ux));
          break;
        case Constants.GlobalAutoNumber:
          migrationObjects.push(new GlobalAutoNumberMigrationTool(namespace, conn, this.logger, messages, this.ux));
          break;
        case Constants.CustomLabel:
          migrationObjects.push(new CustomLabelsMigrationTool(namespace, conn, this.logger, messages, this.ux));
          break;
        default:
          throw new Error(messages.getMessage('invalidOnlyFlag'));
      }
    }
    return migrationObjects;
  }

  /**
   * Pre-process all components to register their name mappings
   */
  private async preProcessAllComponents(namespace: string, conn: any, migrateOnly: string): Promise<void> {
    try {
      const nameRegistry = NameMappingRegistry.getInstance();
      // Query all components that will be migrated
      const dataMappers = await this.queryDataMappers(conn, namespace);
      const allOmniScripts = await this.queryOmniScripts(conn, namespace, false); // All OmniScripts (LWC + Angular)
      const integrationProcedures = await this.queryOmniScripts(conn, namespace, true); // Integration Procedures only
      const flexCards = await this.queryFlexCards(conn, namespace);

      // Separate OmniScripts into LWC and Angular types
      const { lwc: lwcOmniScripts, angular: angularOmniScripts } = this.separateOmniScriptsByType(
        allOmniScripts,
        namespace
      );

      // Filter based on migrateOnly flag if specified
      const filteredData = this.filterComponentsByMigrateOnly(
        migrateOnly,
        dataMappers,
        lwcOmniScripts, // Only LWC OmniScripts for migration
        integrationProcedures,
        flexCards
      );

      // Register all name mappings (including Angular OmniScripts for tracking)
      nameRegistry.preProcessComponents(
        filteredData.dataMappers,
        filteredData.omniScripts, // LWC OmniScripts
        angularOmniScripts, // Angular OmniScripts (for tracking)
        filteredData.integrationProcedures,
        filteredData.flexCards
      );

      const allMappings = nameRegistry.getAllNameMappings();
      Logger.log(messages.getMessage('completeComponentMappingMessage', [allMappings.length]));
    } catch (error) {
      Logger.error(messages.getMessage('errorComponentMapping'), error);
    }
  }

  /**
   * Query DataMappers from the org
   */
  private async queryDataMappers(conn: any, namespace: string): Promise<any[]> {
    const query = `SELECT Id, Name FROM ${namespace}__DRBundle__c WHERE ${namespace}__Type__c != 'Migration'`;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = await conn.query(query);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result.records || [];
  }

  /**
   * Query OmniScripts from the org (both LWC and Angular)
   */
  private async queryOmniScripts(conn: any, namespace: string, isProcedure: boolean): Promise<any[]> {
    const procedureFilter = isProcedure ? 'true' : 'false';
    // Query all OmniScripts (both LWC and Angular)
    const query = `SELECT Id, Name, ${namespace}__Type__c, ${namespace}__SubType__c, ${namespace}__Language__c, ${namespace}__IsProcedure__c, ${namespace}__IsLwcEnabled__c FROM ${namespace}__OmniScript__c WHERE ${namespace}__IsProcedure__c = ${procedureFilter} and ${namespace}__IsActive__c = true`;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = await conn.query(query);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result.records || [];
  }

  /**
   * Separate OmniScripts into LWC and Angular based on IsLwcEnabled__c field
   */
  private separateOmniScriptsByType(omniscripts: any[], namespace: string): { lwc: any[]; angular: any[] } {
    const lwc: any[] = [];
    const angular: any[] = [];

    for (const omniscript of omniscripts) {
      const isLwcEnabled = omniscript[`${namespace}__IsLwcEnabled__c`];
      if (isLwcEnabled) {
        lwc.push(omniscript);
      } else {
        angular.push(omniscript);
      }
    }

    return { lwc, angular };
  }

  /**
   * Query FlexCards from the org
   */
  private async queryFlexCards(conn: any, namespace: string): Promise<any[]> {
    const query = `SELECT Id, Name FROM ${namespace}__VlocityCard__c WHERE ${namespace}__CardType__c = 'flex' AND ${namespace}__Active__c = true`;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const result = await conn.query(query);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result.records || [];
  }

  /**
   * Filter components based on the migrateOnly flag
   */
  private filterComponentsByMigrateOnly(
    migrateOnly: string,
    dataMappers: any[],
    omniScripts: any[],
    integrationProcedures: any[],
    flexCards: any[]
  ): {
    dataMappers: any[];
    omniScripts: any[];
    integrationProcedures: any[];
    flexCards: any[];
  } {
    if (!migrateOnly) {
      return { dataMappers, omniScripts, integrationProcedures, flexCards };
    }

    // Return only the components that match the migrateOnly filter
    switch (migrateOnly) {
      case Constants.DataMapper:
        return { dataMappers, omniScripts: [], integrationProcedures: [], flexCards: [] };
      case Constants.Omniscript:
        return { dataMappers: [], omniScripts, integrationProcedures: [], flexCards: [] };
      case Constants.IntegrationProcedure:
        return { dataMappers: [], omniScripts: [], integrationProcedures, flexCards: [] };
      case Constants.Flexcard:
        return { dataMappers: [], omniScripts: [], integrationProcedures: [], flexCards };
      default:
        return { dataMappers: [], omniScripts: [], integrationProcedures: [], flexCards: [] };
    }
  }

  private async getTargetApexNamespace(objectsToProcess: string[], targetApexNamespace: string): Promise<string> {
    if (objectsToProcess.includes(Constants.Apex)) {
      targetApexNamespace = await this.ux.prompt(messages.getMessage('enterTargetNamespace'));
      Logger.log(messages.getMessage('usingTargetNamespace', [targetApexNamespace]));
    }
    return targetApexNamespace;
  }

  private async getGeneralConsent(): Promise<boolean> {
    let consent: boolean | null = null;

    while (consent === null) {
      try {
        consent = await Logger.confirm(messages.getMessage('userConsentMessage'));
      } catch (error) {
        Logger.log(messages.getMessage('invalidYesNoResponse'));
        consent = null;
      }
    }

    return consent;
  }

  private mergeRecordAndUploadResults(
    migrationResults: MigrationResult,
    migrationTool: MigrationTool
  ): MigratedRecordInfo[] {
    const mergedResults: MigratedRecordInfo[] = [];

    for (const record of Array.from(migrationResults.records.values())) {
      const obj: MigratedRecordInfo = {
        id: record['Id'],
        name: migrationTool.getRecordName(record),
        status: 'Skipped',
        errors: record['errors'],
        migratedId: undefined,
        warnings: [],
        migratedName: '',
        localizationStatus: record['localizationStatus'] || {},
      };

      if (migrationResults.results.has(record['Id'])) {
        const recordResults = migrationResults.results.get(record['Id']);

        let errors: any[] = obj.errors || [];
        errors = errors.concat(recordResults.errors || []);

        if (recordResults?.skipped) {
          obj.status = 'Skipped';
        } else if (!recordResults || recordResults.hasErrors) {
          obj.status = 'Failed';
        } else {
          obj.status = 'Successfully migrated';
        }

        obj.errors = errors;
        obj.migratedId = recordResults.id;
        obj.warnings = recordResults.warnings;
        obj.migratedName = recordResults.newName;
      }

      mergedResults.push(obj);
    }

    return mergedResults;
  }

  private logTruncationErrors(objectMigrationResults: MigratedObject[]): void {
    objectMigrationResults.forEach((result) => {
      if (result.errors && result.errors.length > 0) {
        Logger.error(messages.getMessage('truncationFailed', [result.name, result.errors.join(', ')]));
      }
    });
  }
}
