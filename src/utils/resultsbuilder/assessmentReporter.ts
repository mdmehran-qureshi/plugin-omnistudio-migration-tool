/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import fs from 'fs';
import path from 'path';
import open from 'open';
import { Messages } from '@salesforce/core';
import { AssessmentInfo } from '../interfaces';
import { DashboardParam } from '../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../orgUtils';
import { Constants } from '../constants/stringContants';
import { pushAssestUtilites } from '../file/fileUtil';
import { TemplateParser } from '../templateParser/generate';
import { getOrgDetailsForReport } from '../reportGenerator/reportUtil';
import { CustomLabelAssessmentInfo } from '../customLabels';
import { Logger } from '../logger';
import { OSAssessmentReporter } from './OSAssessmentReporter';
import { ApexAssessmentReporter } from './ApexAssessmentReporter';
import { IPAssessmentReporter } from './IPAssessmentReporter';
import { DRAssessmentReporter } from './DRAssessmentReporter';
import { FlexcardAssessmentReporter } from './FlexcardAssessmentReporter';
import { LWCAssessmentReporter } from './LWCAssessmentReporter';
import { GlobalAutoNumberAssessmentReporter } from './GlobalAutoNumberAssessmentReporter';
import { FlexipageAssessmentReporter } from './FlexipageAssessmentReporter';
import { ExperienceSiteAssessmentReporter } from './ExperienceSiteAssessmentReporter';
import { CustomLabelAssessmentReporter } from './CustomLabelAssessmentReporter';

export class AssessmentReporter {
  private static basePath = path.join(process.cwd(), 'assessment_reports');
  private static omniscriptAssessmentFileName = 'omniscript_assessment.html';
  private static flexcardAssessmentFileName = 'flexcard_assessment.html';
  private static integrationProcedureAssessmentFileName = 'integration_procedure_assessment.html';
  private static dataMapperAssessmentFileName = 'datamapper_assessment.html';
  private static globalAutoNumberAssessmentFileName = 'globalautonumber_assessment.html';
  private static apexAssessmentFileName = 'apex_assessment.html';
  private static lwcAssessmentFileName = 'lwc_assessment.html';
  private static dashboardFileName = 'dashboard.html';
  private static templateDir = 'templates';
  private static experienceSiteAssessmentFileName = 'experience_site_assessment.html';
  private static flexipageAssessmentFileName = 'flexipage_assessment.html';
  private static customLabelAssessmentFileName = 'customlabel_assessment.html';
  private static dashboardTemplateName = 'dashboard.template';
  private static reportTemplateName = 'assessmentReport.template';
  private static dashboardTemplate = path.join(__dirname, '..', '..', this.templateDir, this.dashboardTemplateName);

  public static async generate(
    result: AssessmentInfo,
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    assessOnly: string,
    relatedObjects: string[],
    messages: Messages,
    userActionMessages: string[]
  ): Promise<void> {
    fs.mkdirSync(this.basePath, { recursive: true });

    const reports = [];
    const assessmentReportTemplate = fs.readFileSync(
      path.join(__dirname, '..', '..', this.templateDir, this.reportTemplateName),
      'utf8'
    );
    if (!assessOnly) {
      reports.push(
        Constants.Omniscript,
        Constants.Flexcard,
        Constants.IntegrationProcedure,
        Constants.DataMapper,
        Constants.GlobalAutoNumber,
        Constants.CustomLabel
      );
      this.createDocument(
        path.join(this.basePath, this.omniscriptAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          OSAssessmentReporter.getOmniscriptAssessmentData(
            result.omniAssessmentInfo.osAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          ),
          messages
        )
      );

      this.createDocument(
        path.join(this.basePath, this.flexcardAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          FlexcardAssessmentReporter.getFlexcardAssessmentData(
            result.flexCardAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          ),
          messages
        )
      );

      this.createDocument(
        path.join(this.basePath, this.integrationProcedureAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          IPAssessmentReporter.getIntegrationProcedureAssessmentData(
            result.omniAssessmentInfo.ipAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          ),
          messages
        )
      );

      this.createDocument(
        path.join(this.basePath, this.dataMapperAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          DRAssessmentReporter.getDatamapperAssessmentData(
            result.dataRaptorAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          ),
          messages
        )
      );

      this.createDocument(
        path.join(this.basePath, this.globalAutoNumberAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          GlobalAutoNumberAssessmentReporter.getGlobalAutoNumberAssessmentData(
            result.globalAutoNumberAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails
          ),
          messages
        )
      );

      // Generate custom labels report with pagination (empty if no labels need manual intervention)
      const customLabels = result.customLabelAssessmentInfos || [];
      this.generateCustomLabelAssessmentReport(
        customLabels,
        instanceUrl,
        omnistudioOrgDetails,
        messages,
        assessmentReportTemplate
      );
    } else {
      switch (assessOnly) {
        case Constants.Omniscript:
          reports.push(Constants.Omniscript);
          this.createDocument(
            path.join(this.basePath, this.omniscriptAssessmentFileName),
            TemplateParser.generate(
              assessmentReportTemplate,
              OSAssessmentReporter.getOmniscriptAssessmentData(
                result.omniAssessmentInfo.osAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              ),
              messages
            )
          );
          break;

        case Constants.Flexcard:
          reports.push(Constants.Flexcard);
          this.createDocument(
            path.join(this.basePath, this.flexcardAssessmentFileName),
            TemplateParser.generate(
              assessmentReportTemplate,
              FlexcardAssessmentReporter.getFlexcardAssessmentData(
                result.flexCardAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              ),
              messages
            )
          );
          break;

        case Constants.IntegrationProcedure:
          reports.push(Constants.IntegrationProcedure);
          this.createDocument(
            path.join(this.basePath, this.integrationProcedureAssessmentFileName),
            TemplateParser.generate(
              assessmentReportTemplate,
              IPAssessmentReporter.getIntegrationProcedureAssessmentData(
                result.omniAssessmentInfo.ipAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              ),
              messages
            )
          );
          break;

        case Constants.DataMapper:
          reports.push(Constants.DataMapper);
          this.createDocument(
            path.join(this.basePath, this.dataMapperAssessmentFileName),
            TemplateParser.generate(
              assessmentReportTemplate,
              DRAssessmentReporter.getDatamapperAssessmentData(
                result.dataRaptorAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              ),
              messages
            )
          );
          break;

        case Constants.GlobalAutoNumber:
          reports.push(Constants.GlobalAutoNumber);
          this.createDocument(
            path.join(this.basePath, this.globalAutoNumberAssessmentFileName),
            TemplateParser.generate(
              assessmentReportTemplate,
              GlobalAutoNumberAssessmentReporter.getGlobalAutoNumberAssessmentData(
                result.globalAutoNumberAssessmentInfos,
                instanceUrl,
                omnistudioOrgDetails
              ),
              messages
            )
          );
          break;

        case Constants.CustomLabel:
          reports.push(Constants.CustomLabel);
          this.generateCustomLabelAssessmentReport(
            result.customLabelAssessmentInfos,
            instanceUrl,
            omnistudioOrgDetails,
            messages,
            assessmentReportTemplate
          );
          break;

        default:
      }
    }

    if (relatedObjects && relatedObjects.includes(Constants.Apex)) {
      reports.push(Constants.Apex);
      this.createDocument(
        path.join(this.basePath, this.apexAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          ApexAssessmentReporter.getApexAssessmentData(result.apexAssessmentInfos, omnistudioOrgDetails),
          messages
        )
      );
    }

    if (relatedObjects && relatedObjects.includes(Constants.ExpSites)) {
      reports.push(Constants.ExpSites);
      this.createDocument(
        path.join(this.basePath, this.experienceSiteAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          ExperienceSiteAssessmentReporter.getExperienceSiteAssessmentData(
            result.experienceSiteAssessmentInfos,
            omnistudioOrgDetails
          ),
          messages
        )
      );
    }

    if (relatedObjects && relatedObjects.includes(Constants.FlexiPage)) {
      reports.push(Constants.FlexiPage);
      this.createDocument(
        path.join(this.basePath, this.flexipageAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          FlexipageAssessmentReporter.getFlexipageAssessmentData(result.flexipageAssessmentInfos, omnistudioOrgDetails),
          messages
        )
      );
    }

    if (relatedObjects && relatedObjects.includes(Constants.LWC)) {
      reports.push(Constants.LWC);
      this.createDocument(
        path.join(this.basePath, this.lwcAssessmentFileName),
        TemplateParser.generate(
          assessmentReportTemplate,
          LWCAssessmentReporter.getLwcAssessmentData(result.lwcAssessmentInfos, omnistudioOrgDetails),
          messages
        )
      );
    }

    // await this.createMasterDocument(nameUrls, basePath);
    this.createDashboard(this.basePath, result, omnistudioOrgDetails, messages, reports, userActionMessages);
    pushAssestUtilites('javascripts', this.basePath);
    pushAssestUtilites('styles', this.basePath);
    await open(path.join(this.basePath, this.dashboardFileName));
  }

  private static generateCustomLabelAssessmentReport(
    customLabels: CustomLabelAssessmentInfo[],
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages,
    assessmentReportTemplate: string
  ): void {
    const pageSize = 1000;
    const totalLabels = customLabels.length;
    const totalPages = Math.ceil(totalLabels / pageSize);

    // Generate paginated reports
    for (let page = 1; page <= totalPages; page++) {
      const data = CustomLabelAssessmentReporter.getCustomLabelAssessmentData(
        customLabels,
        instanceUrl,
        omnistudioOrgDetails,
        page,
        pageSize
      );

      const html = TemplateParser.generate(assessmentReportTemplate, data, messages);

      const fileName =
        totalPages > 1
          ? `customlabel_assessment_Page_${page}_of_${totalPages}.html`
          : this.customLabelAssessmentFileName;
      fs.writeFileSync(path.join(this.basePath, fileName), html);

      Logger.logVerbose(
        messages.getMessage('generatedCustomLabelAssessmentReportPage', [page, totalPages, data.rows.length])
      );
    }
  }

  private static getCustomLabelAssessmentFileName(totalLabels: number): string {
    const pageSize = 1000;
    const totalPages = Math.ceil(totalLabels / pageSize);
    return totalPages > 1 ? `customlabel_assessment_Page_1_of_${totalPages}.html` : this.customLabelAssessmentFileName;
  }

  private static createDashboard(
    basePath: string,
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    messages: Messages,
    reports: string[],
    userActionMessages: string[]
  ): void {
    const dashboardTemplate = fs.readFileSync(this.dashboardTemplate, 'utf8');
    this.createDocument(
      path.join(basePath, this.dashboardFileName),
      TemplateParser.generate(
        dashboardTemplate,
        this.createDashboardParam(result, omnistudioOrgDetails, reports, userActionMessages),
        messages
      )
    );
  }
  private static createDashboardParam(
    result: AssessmentInfo,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    reports: string[],
    userActionMessages: string[]
  ): DashboardParam {
    const summaryItems = [];
    if (reports.includes(Constants.DataMapper)) {
      summaryItems.push({
        name: 'DataMappers',
        total: result.dataRaptorAssessmentInfos.length,
        data: DRAssessmentReporter.getSummaryData(result.dataRaptorAssessmentInfos),
        file: this.dataMapperAssessmentFileName,
      });
    }
    if (reports.includes(Constants.IntegrationProcedure)) {
      summaryItems.push({
        name: 'Integration Procedures',
        total: result.omniAssessmentInfo.ipAssessmentInfos.length,
        data: IPAssessmentReporter.getSummaryData(result.omniAssessmentInfo.ipAssessmentInfos),
        file: this.integrationProcedureAssessmentFileName,
      });
    }
    if (reports.includes(Constants.Omniscript)) {
      summaryItems.push({
        name: 'Omniscripts',
        total: result.omniAssessmentInfo.osAssessmentInfos.length,
        data: OSAssessmentReporter.getSummaryData(result.omniAssessmentInfo.osAssessmentInfos),
        file: this.omniscriptAssessmentFileName,
      });
    }
    if (reports.includes(Constants.Flexcard)) {
      summaryItems.push({
        name: 'Flexcards',
        total: result.flexCardAssessmentInfos.length,
        data: FlexcardAssessmentReporter.getSummaryData(result.flexCardAssessmentInfos),
        file: this.flexcardAssessmentFileName,
      });
    }
    if (reports.includes(Constants.GlobalAutoNumber)) {
      summaryItems.push({
        name: 'Global Auto Numbers',
        total: result.globalAutoNumberAssessmentInfos.length,
        data: GlobalAutoNumberAssessmentReporter.getSummaryData(result.globalAutoNumberAssessmentInfos),
        file: this.globalAutoNumberAssessmentFileName,
      });
    }
    if (reports.includes(Constants.Apex)) {
      summaryItems.push({
        name: 'Apex Classes',
        total: result.apexAssessmentInfos.length,
        data: ApexAssessmentReporter.getSummaryData(result.apexAssessmentInfos),
        file: this.apexAssessmentFileName,
      });
    }
    if (reports.includes(Constants.FlexiPage)) {
      summaryItems.push({
        name: 'FlexiPages',
        total: result.flexipageAssessmentInfos.length,
        data: FlexipageAssessmentReporter.getSummaryData(result.flexipageAssessmentInfos),
        file: this.flexipageAssessmentFileName,
      });
    }
    if (reports.includes(Constants.ExpSites)) {
      // TODO - Experience Sites
      summaryItems.push({
        name: 'Experience Sites',
        total: result.experienceSiteAssessmentInfos.length,
        data: ExperienceSiteAssessmentReporter.getSummaryData(result.experienceSiteAssessmentInfos),
        file: this.experienceSiteAssessmentFileName,
      });
    }

    if (reports.includes(Constants.LWC)) {
      summaryItems.push({
        name: 'Lightning Web Components',
        total: result.lwcAssessmentInfos.length,
        data: LWCAssessmentReporter.getSummaryData(result.lwcAssessmentInfos),
        file: this.lwcAssessmentFileName,
      });
    }
    if (reports.includes(Constants.CustomLabel)) {
      summaryItems.push({
        name: 'Custom Labels',
        total: result.customLabelStatistics.totalLabels,
        data: [
          {
            name: 'Can be Automated',
            count: result.customLabelStatistics.canBeAutomated,
            cssClass: 'text-success',
          },
          {
            name: 'Need Manual Intervention',
            count: result.customLabelStatistics.needManualIntervention,
            cssClass: 'text-warning',
          },
        ],
        file: this.getCustomLabelAssessmentFileName(result.customLabelStatistics.needManualIntervention),
      });
    }
    return {
      title: 'Omnistudio Assessment Report Dashboard',
      heading: 'Omnistudio Assessment Report Dashboard',
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toLocaleString(),
      summaryItems,
      mode: 'assess',
      actionItems: userActionMessages,
    };
  }

  private static createDocument(filePath: string, htmlBody: string): void {
    fs.writeFileSync(filePath, htmlBody);
  }
}
