import * as os from 'os';
import { flags } from '@salesforce/command';
import { Messages, Connection } from '@salesforce/core';
import OmniStudioBaseCommand from '../../basecommand';
import { AssessmentInfo } from '../../../utils/interfaces';
import { AssessmentReporter } from '../../../utils/resultsbuilder/assessmentReporter';
import { OmniScriptExportType, OmniScriptMigrationTool } from '../../../migration/omniscript';
import { InvalidEntityTypeError } from '../../../migration/interfaces';
import { CardMigrationTool } from '../../../migration/flexcard';
import { DataRaptorMigrationTool } from '../../../migration/dataraptor';
import { GlobalAutoNumberMigrationTool } from '../../../migration/globalautonumber';
import { DebugTimer } from '../../../utils';
import { Logger } from '../../../utils/logger';
import OmnistudioRelatedObjectMigrationFacade from '../../../migration/related/OmnistudioRelatedObjectMigrationFacade';
import { OmnistudioOrgDetails, OrgUtils } from '../../../utils/orgUtils';
import { OrgPreferences } from '../../../utils/orgPreferences';
import { Constants } from '../../../utils/constants/stringContants';
import { ProjectPathUtil } from '../../../utils/projectPathUtil';
import { PreMigrate } from '../../../migration/premigrate';
import { PostMigrate } from '../../../migration/postMigrate';
import { CustomLabelsUtil } from '../../../utils/customLabels';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'assess');

export default class Assess extends OmniStudioBaseCommand {
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
      description: messages.getMessage('enableVerboseOutput'),
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async run(): Promise<any> {
    Logger.initialiseLogger(this.ux, this.logger, 'assess', this.flags.verbose);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return await this.runAssess();
    } catch (e) {
      const error = e as Error;
      Logger.error(messages.getMessage('errorRunningAssess', [error.message]), error);
      process.exit(1);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async runAssess(): Promise<any> {
    DebugTimer.getInstance().start();
    const allVersions = (this.flags.allversions || false) as boolean;
    const assessOnly = (this.flags.only || '') as string;
    const relatedObjects = (this.flags.relatedobjects || '') as string;
    const isExperienceBundleMetadataAPIProgramaticallyEnabled: { value: boolean } = { value: false };
    const conn = this.org.getConnection();
    let objectsToProcess: string[];
    // To-Do: Add LWC to valid options when GA is released
    const validOptions = [Constants.Apex, Constants.ExpSites, Constants.FlexiPage, Constants.LWC];
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

    const namespace = orgs.packageDetails.namespace;
    let projectPath = '';
    const preMigrate: PreMigrate = new PreMigrate(namespace, conn, this.logger, messages, this.ux);
    if (relatedObjects) {
      objectsToProcess = relatedObjects.split(',').map((obj) => obj.trim());
      projectPath = await ProjectPathUtil.getProjectPath(messages, true);

      await preMigrate.handleExperienceSitePrerequisites(
        objectsToProcess,
        conn,
        isExperienceBundleMetadataAPIProgramaticallyEnabled
      );
    }

    const assesmentInfo: AssessmentInfo = {
      lwcAssessmentInfos: [],
      apexAssessmentInfos: [],
      dataRaptorAssessmentInfos: [],
      flexCardAssessmentInfos: [],
      globalAutoNumberAssessmentInfos: [],
      omniAssessmentInfo: {
        osAssessmentInfos: [],
        ipAssessmentInfos: [],
      },
      flexipageAssessmentInfos: [],
      experienceSiteAssessmentInfos: [],
      customLabelAssessmentInfos: [],
      customLabelStatistics: { totalLabels: 0, canBeAutomated: 0, needManualIntervention: 0 },
    };

    Logger.log(messages.getMessage('assessmentInitialization', [String(namespace)]));
    Logger.log(messages.getMessage('apiVersionInfo', [String(apiVersion)]));
    Logger.logVerbose(messages.getMessage('assessmentTargets', [String(this.flags.only || 'all')]));
    Logger.logVerbose(messages.getMessage('relatedObjectsInfo', [relatedObjects || 'none']));
    Logger.logVerbose(messages.getMessage('allVersionsFlagInfo', [String(allVersions)]));

    try {
      // Assess OmniStudio components
      await this.assessOmniStudioComponents(assesmentInfo, assessOnly, namespace, conn, allVersions);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (ex: any) {
      if (ex instanceof InvalidEntityTypeError) {
        Logger.error(messages.getMessage('invalidTypeAssessErrorMessage', [namespace]));
        process.exit(1);
      }

      if (ex instanceof Error) {
        Logger.error(messages.getMessage('errorRunningAssess', [ex.message]));
        process.exit(1);
      }
    }

    // Assess related objects if specified
    if (relatedObjects) {
      objectsToProcess = relatedObjects.split(',').map((obj) => obj.trim());

      // Validate input
      for (const obj of objectsToProcess) {
        if (!validOptions.includes(obj)) {
          Logger.error(messages.getMessage('invalidRelatedObjectsOption', [String(obj)]));
          process.exit(1);
        }
      }

      const omnistudioRelatedObjectsMigration = new OmnistudioRelatedObjectMigrationFacade(
        namespace,
        assessOnly,
        allVersions,
        this.org,
        projectPath
      );
      const relatedObjectAssessmentResult = omnistudioRelatedObjectsMigration.assessAll(objectsToProcess);
      assesmentInfo.lwcAssessmentInfos = relatedObjectAssessmentResult.lwcAssessmentInfos;
      assesmentInfo.apexAssessmentInfos = relatedObjectAssessmentResult.apexAssessmentInfos;
      assesmentInfo.flexipageAssessmentInfos = relatedObjectAssessmentResult.flexipageAssessmentInfos;
      assesmentInfo.experienceSiteAssessmentInfos = relatedObjectAssessmentResult.experienceSiteAssessmentInfos;
    }
    try {
      orgs.rollbackFlags = await OrgPreferences.checkRollbackFlags(conn);
    } catch (error) {
      Logger.log((error as Error).message);
      Logger.log((error as Error).stack);
    }

    // Post Assessment tasks
    const postMigrate: PostMigrate = new PostMigrate(
      this.org,
      namespace,
      conn,
      this.logger,
      messages,
      this.ux,
      objectsToProcess
    );

    const userActionMessages: string[] = [];
    await postMigrate.restoreExperienceAPIMetadataSettings(
      isExperienceBundleMetadataAPIProgramaticallyEnabled,
      userActionMessages
    );

    await AssessmentReporter.generate(
      assesmentInfo,
      conn.instanceUrl,
      orgs,
      assessOnly,
      objectsToProcess,
      messages,
      userActionMessages
    );
    return assesmentInfo;
  }

  private async assessOmniStudioComponents(
    assesmentInfo: AssessmentInfo,
    assessOnly: string,
    namespace: string,
    conn: Connection,
    allVersions: boolean
  ): Promise<void> {
    if (!assessOnly) {
      // If no specific component is specified, assess all components
      await this.assessDataRaptors(assesmentInfo, namespace, conn);
      await this.assessFlexCards(assesmentInfo, namespace, conn, allVersions);
      await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.OS);
      await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.IP);
      await this.assessGlobalAutoNumbers(assesmentInfo, namespace, conn);
      await this.assessCustomLabels(assesmentInfo, namespace, conn);
      return;
    }

    switch (assessOnly) {
      case Constants.DataMapper:
        await this.assessDataRaptors(assesmentInfo, namespace, conn);
        break;
      case Constants.Flexcard:
        await this.assessFlexCards(assesmentInfo, namespace, conn, allVersions);
        break;
      case Constants.Omniscript:
        await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.OS);
        break;
      case Constants.IntegrationProcedure:
        await this.assessOmniScripts(assesmentInfo, namespace, conn, allVersions, OmniScriptExportType.IP);
        break;
      case Constants.GlobalAutoNumber:
        await this.assessGlobalAutoNumbers(assesmentInfo, namespace, conn);
        break;
      case Constants.CustomLabel:
        await this.assessCustomLabels(assesmentInfo, namespace, conn);
        break;
      default:
        throw new Error(messages.getMessage('invalidOnlyFlag'));
    }
  }

  private async assessDataRaptors(assesmentInfo: AssessmentInfo, namespace: string, conn: Connection): Promise<void> {
    const drMigrator = new DataRaptorMigrationTool(namespace, conn, Logger, messages, this.ux);
    assesmentInfo.dataRaptorAssessmentInfos = await drMigrator.assess();
    Logger.logVerbose(
      messages.getMessage('assessedDataRaptorsCount', [assesmentInfo.dataRaptorAssessmentInfos.length])
    );
    Logger.log(messages.getMessage('dataRaptorAssessmentCompleted'));
  }

  private async assessFlexCards(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection,
    allVersions: boolean
  ): Promise<void> {
    const flexMigrator = new CardMigrationTool(namespace, conn, Logger, messages, this.ux, allVersions);
    Logger.logVerbose(messages.getMessage('flexCardAssessment'));
    assesmentInfo.flexCardAssessmentInfos = await flexMigrator.assess();
    Logger.logVerbose(messages.getMessage('assessedFlexCardsCount', [assesmentInfo.flexCardAssessmentInfos.length]));
    Logger.log(messages.getMessage('flexCardAssessmentCompleted'));
  }

  private async assessOmniScripts(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection,
    allVersions: boolean,
    exportType: OmniScriptExportType
  ): Promise<void> {
    const exportComponentType = exportType === OmniScriptExportType.IP ? 'Integration Procedures' : 'Omniscripts';
    Logger.logVerbose(messages.getMessage('omniScriptAssessment', [exportComponentType]));
    const osMigrator = new OmniScriptMigrationTool(exportType, namespace, conn, Logger, messages, this.ux, allVersions);
    const newOmniAssessmentInfo = await osMigrator.assess(
      assesmentInfo.dataRaptorAssessmentInfos,
      assesmentInfo.flexCardAssessmentInfos
    );

    // Initialize omniAssessmentInfo if it doesn't exist
    if (!assesmentInfo.omniAssessmentInfo) {
      assesmentInfo.omniAssessmentInfo = {
        osAssessmentInfos: [],
        ipAssessmentInfos: [],
      };
    }

    // Merge results instead of overwriting
    if (exportType === OmniScriptExportType.OS) {
      // For OmniScript assessment, update osAssessmentInfos
      assesmentInfo.omniAssessmentInfo.osAssessmentInfos = newOmniAssessmentInfo.osAssessmentInfos;
      Logger.logVerbose(
        messages.getMessage('assessedOmniScriptsCount', [assesmentInfo.omniAssessmentInfo.osAssessmentInfos.length])
      );
    } else {
      // For Integration Procedure assessment, update ipAssessmentInfos
      assesmentInfo.omniAssessmentInfo.ipAssessmentInfos = newOmniAssessmentInfo.ipAssessmentInfos;
      Logger.logVerbose(
        messages.getMessage('assessedIntegrationProceduresCount', [
          assesmentInfo.omniAssessmentInfo.ipAssessmentInfos.length,
        ])
      );
    }
    Logger.log(messages.getMessage('omniScriptAssessmentCompleted', [exportComponentType]));
  }

  private async assessGlobalAutoNumbers(
    assesmentInfo: AssessmentInfo,
    namespace: string,
    conn: Connection
  ): Promise<void> {
    Logger.logVerbose(messages.getMessage('startingGlobalAutoNumberAssessment'));
    const globalAutoNumberMigrationTool = new GlobalAutoNumberMigrationTool(namespace, conn, Logger, messages, this.ux);
    assesmentInfo.globalAutoNumberAssessmentInfos = await globalAutoNumberMigrationTool.assess();
    Logger.logVerbose(
      messages.getMessage('assessedGlobalAutoNumbersCount', [assesmentInfo.globalAutoNumberAssessmentInfos.length])
    );
    Logger.log(messages.getMessage('globalAutoNumberAssessmentCompleted'));
  }

  private async assessCustomLabels(assesmentInfo: AssessmentInfo, namespace: string, conn: Connection): Promise<void> {
    try {
      Logger.log(messages.getMessage('startingCustomLabelAssessment'));
      const customLabelResult = await CustomLabelsUtil.fetchCustomLabels(conn, namespace, messages);
      assesmentInfo.customLabelAssessmentInfos = customLabelResult.labels;
      assesmentInfo.customLabelStatistics = customLabelResult.statistics;
      Logger.logVerbose(
        messages.getMessage('assessedCustomLabelsCount', [assesmentInfo.customLabelAssessmentInfos.length])
      );
      Logger.log(messages.getMessage('customLabelAssessmentCompleted'));
    } catch (error) {
      Logger.error(messages.getMessage('errorDuringCustomLabelAssessment', [(error as Error).message]));
      assesmentInfo.customLabelAssessmentInfos = [];
      assesmentInfo.customLabelStatistics = { totalLabels: 0, canBeAutomated: 0, needManualIntervention: 0 };
    }
  }
}
