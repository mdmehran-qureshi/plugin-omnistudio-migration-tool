/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
import fs from 'fs';
import path from 'path';
import open from 'open';
import { Messages } from '@salesforce/core';
import { pushAssestUtilites } from '../file/fileUtil';
import {
  ApexAssessmentInfo,
  LWCAssessmentInfo,
  MigratedObject,
  MigratedRecordInfo,
  RelatedObjectAssesmentInfo,
  ExperienceSiteAssessmentInfo,
  FlexiPageAssessmentInfo,
} from '../interfaces';
import {
  ReportParam,
  ReportRowParam,
  SummaryItemDetailParam,
  SummaryItemParam,
  DashboardParam,
  FilterGroupParam,
} from '../reportGenerator/reportInterfaces';
import { OmnistudioOrgDetails } from '../orgUtils';
import { TemplateParser } from '../templateParser/generate';
import { createFilterGroupParam, createRowDataParam } from '../reportGenerator/reportUtil';
import { FileDiffUtil } from '../lwcparser/fileutils/FileDiffUtil';
import { Logger } from '../logger';
import { getMigrationHeading } from '../stringUtils';
import { Constants } from '../constants/stringContants';
import { CustomLabelMigrationInfo, CustomLabelMigrationReporter } from './CustomLabelMigrationReporter';
const resultsDir = path.join(process.cwd(), 'migration_report');
const migrationReportHTMLfileName = 'dashboard.html';
const flexipageFileName = 'flexipage.html';
const templateDir = 'templates';
const reportTemplateName = 'migrationReport.template';
const dashboardTemplateName = 'dashboard.template';
const reportTemplateFilePath = path.join(__dirname, '..', '..', templateDir, reportTemplateName);
const dashboardTemplateFilePath = path.join(__dirname, '..', '..', templateDir, dashboardTemplateName);
const apexFileName = 'apex.html';
const experienceSiteFileName = 'experienceSite.html';
const lwcFileName = 'lwc.html';

export class ResultsBuilder {
  private static rowClass = 'data-row-';
  private static rowId = 0;
  private static experienceSiteFileSuffix = '.json';

  private static flexiPageFileSuffix = '.flexipage-meta.xml';

  public static async generateReport(
    results: MigratedObject[],
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages,
    actionItems: string[],
    objectsToProcess: string[]
  ): Promise<void> {
    fs.mkdirSync(resultsDir, { recursive: true });
    Logger.info(messages.getMessage('generatingComponentReports'));
    for (const result of results) {
      this.generateReportForResult(result, instanceUrl, orgDetails, messages);
    }
    Logger.info(messages.getMessage('generatingRelatedObjectReports'));
    this.generateReportForRelatedObject(
      relatedObjectMigrationResult,
      instanceUrl,
      orgDetails,
      messages,
      objectsToProcess
    );

    Logger.info(messages.getMessage('generatingMigrationReportDashboard'));
    this.generateMigrationReportDashboard(
      orgDetails,
      results,
      relatedObjectMigrationResult,
      messages,
      actionItems,
      objectsToProcess
    );
    pushAssestUtilites('javascripts', resultsDir);
    pushAssestUtilites('styles', resultsDir);
    await open(path.join(resultsDir, migrationReportHTMLfileName));
  }

  private static generateReportForResult(
    result: MigratedObject,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages
  ): void {
    Logger.captureVerboseData(`${result.name} data`, result);

    // Handle Custom Labels migration specifically
    if (result.name.toLowerCase().includes('custom labels')) {
      this.generateCustomLabelsMigrationReport(result, instanceUrl, orgDetails, messages);
      return;
    }

    // Determine which rollback flag to use based on component type
    let rollbackFlagNames: string[] = [];
    const componentName = result.name.toLowerCase();
    if (componentName.includes('datamapper') || componentName.includes('data mapper')) {
      rollbackFlagNames = ['RollbackDRChanges'];
    } else if (componentName.includes('omniscript') || componentName.includes('integration procedure')) {
      rollbackFlagNames = ['RollbackOSChanges', 'RollbackIPChanges'];
    } else if (componentName.includes('global auto number') || componentName.includes('globalautonumber')) {
      rollbackFlagNames = ['RollbackDRChanges', 'RollbackIPChanges'];
    }
    const rollbackFlags = orgDetails.rollbackFlags || [];
    const flags = rollbackFlagNames.filter((flag) => rollbackFlags.includes(flag));
    const data: ReportParam = {
      title: `${getMigrationHeading(result.name)} Migration Report`,
      heading: `${getMigrationHeading(result.name)} Migration Report`,
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toLocaleString(),
      total: result.data?.length || 0,
      filterGroups: [...this.getStatusFilterGroup(result.data?.map((item) => item.status) || [])],
      headerGroups: [
        {
          header: [
            {
              name: 'Managed Package',
              colspan: 2,
              rowspan: 1,
            },
            {
              name: 'Standard',
              colspan: 2,
              rowspan: 1,
            },
            {
              name: 'Status',
              colspan: 1,
              rowspan: 2,
            },
            {
              name: 'Errors',
              colspan: 1,
              rowspan: 2,
            },
            {
              name: 'Summary',
              colspan: 1,
              rowspan: 2,
            },
          ],
        },
        {
          header: [
            {
              name: 'ID',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Name',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'ID',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Name',
              colspan: 1,
              rowspan: 1,
            },
          ],
        },
      ],
      rows: [
        ...(result.data || []).map((item) => ({
          rowId: `${this.rowClass}${this.rowId++}`,
          data: [
            createRowDataParam('id', item.id, false, 1, 1, true, `${instanceUrl}/${item.id}`),
            createRowDataParam('name', item.name, true, 1, 1, false),
            createRowDataParam('migratedId', item.migratedId, false, 1, 1, true, `${instanceUrl}/${item.migratedId}`),
            createRowDataParam('migratedName', item.migratedName, false, 1, 1, false),
            createRowDataParam(
              'status',
              item.status,
              false,
              1,
              1,
              false,
              undefined,
              undefined,
              item.status === 'Successfully migrated' ? 'text-success' : 'text-error'
            ),
            createRowDataParam(
              'errors',
              item.errors ? 'Failed' : 'Has No Errors',
              false,
              1,
              1,
              false,
              undefined,
              item.errors || [],
              item.status === 'Successfully migrated' ? '' : 'text-error'
            ),
            createRowDataParam(
              'summary',
              item.warnings ? 'Warnings' : 'Has No Warnings',
              false,
              1,
              1,
              false,
              undefined,
              item.warnings || [],
              item.status === 'Successfully migrated' ? '' : 'text-error'
            ),
          ],
        })),
      ],
      rollbackFlags: flags.length > 0 ? flags : undefined,
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, result.name.replace(/ /g, '_').replace(/\//g, '_') + '.html'), html);
  }

  private static generateCustomLabelsMigrationReport(
    result: MigratedObject,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages
  ): void {
    Logger.captureVerboseData(`${result.name} data`, result);

    // Convert migration results to CustomLabelMigrationInfo format
    const customLabelMigrationInfos: CustomLabelMigrationInfo[] = [];

    if (result.data) {
      result.data.forEach((record: any, index: number) => {
        // Handle both old and new data formats
        const labelName = record.name || record.labelName;
        const cloneStatus =
          record.status === 'Complete'
            ? 'created'
            : record.status === 'Error'
            ? 'error'
            : record.status === 'Skipped'
            ? 'duplicate'
            : record.status || 'duplicate';
        const localizationStatus = record.localizationStatus || {};
        const errors = record.errors || [];
        const warnings = record.warnings || [];

        customLabelMigrationInfos.push({
          labelName,
          cloneStatus,
          localizationStatus,
          errors,
          warnings,
        });
      });
    }

    const pageSize = 1000; // Smaller page size for better performance
    const totalLabels = customLabelMigrationInfos.length;
    const totalPages = Math.ceil(totalLabels / pageSize);

    Logger.logVerbose(messages.getMessage('generatingCustomLabelsReport', [totalLabels, totalPages, pageSize]));

    // Generate paginated reports
    for (let page = 1; page <= totalPages; page++) {
      const data = CustomLabelMigrationReporter.getCustomLabelMigrationData(
        customLabelMigrationInfos,
        instanceUrl,
        orgDetails,
        page,
        pageSize
      );

      const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');

      // Replace the pagination section with custom generated HTML
      const customPaginationHtml = CustomLabelMigrationReporter.generateCustomTemplateForPage(page, totalPages);
      const modifiedTemplate = reportTemplate.replace(
        /<!-- Pagination Navigation -->[\s\S]*?<\/div>\s*<\/div>\s*<\/c:if>/,
        customPaginationHtml
      );

      const html = TemplateParser.generate(modifiedTemplate, data, messages);

      const fileName = totalPages > 1 ? `Custom_Labels_Page_${page}_of_${totalPages}.html` : 'Custom_Labels.html';
      fs.writeFileSync(path.join(resultsDir, fileName), html);

      Logger.logVerbose(messages.getMessage('generatedCustomLabelsReportPage', [page, totalPages, data.rows.length]));
    }
  }

  private static generateReportForRelatedObject(
    result: RelatedObjectAssesmentInfo,
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages,
    objectsToProcess: string[]
  ): void {
    if (objectsToProcess.includes(Constants.Apex)) {
      this.generateReportForApex(result.apexAssessmentInfos, instanceUrl, orgDetails, messages);
    }
    if (objectsToProcess.includes(Constants.ExpSites)) {
      this.generateReportForExperienceSites(result.experienceSiteAssessmentInfos, instanceUrl, orgDetails, messages);
    }
    if (objectsToProcess.includes(Constants.FlexiPage)) {
      this.generateReportForFlexipage(result.flexipageAssessmentInfos, instanceUrl, orgDetails, messages);
    }
    if (objectsToProcess.includes(Constants.LWC)) {
      this.generateReportForLwc(result.lwcAssessmentInfos, instanceUrl, orgDetails, messages);
    }
  }

  private static generateReportForExperienceSites(
    result: ExperienceSiteAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages
  ): void {
    Logger.logVerbose('Generating experience site report');
    const data: ReportParam = {
      title: 'Experience Sites Migration Report',
      heading: 'Experience Sites Migration Report',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toLocaleString(),
      total: result.length,
      filterGroups: [...this.getStatusFilterGroup(result.map((item) => item.status))],
      headerGroups: [
        {
          header: [
            {
              name: 'Experience Site Name',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'File Reference',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Status',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Differences',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Errors',
              colspan: 1,
              rowspan: 1,
            },
          ],
        },
      ],
      rows: result.map((item) => ({
        rowId: `${this.rowClass}${this.rowId++}`,
        data: [
          createRowDataParam('name', item.name, true, 1, 1, false),
          createRowDataParam('path', `${item.name}${this.experienceSiteFileSuffix}`, false, 1, 1, true, item.path),
          createRowDataParam(
            'status',
            item.status,
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            item.status === 'Successfully migrated' ? 'text-success' : 'text-error'
          ),
          createRowDataParam(
            'diff',
            item.name + 'diff',
            false,
            1,
            1,
            false,
            undefined,
            FileDiffUtil.getDiffHTML(item.diff, this.rowId.toString())
          ),
          createRowDataParam(
            'errors',
            item.warnings && item.warnings.length > 0 ? 'Failed' : 'Complete',
            false,
            1,
            1,
            false,
            undefined,
            item.warnings,
            item.status === 'Successfully migrated' ? '' : 'text-error'
          ),
        ],
      })),
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data, messages);
    Logger.logVerbose('Generating experience site file ' + experienceSiteFileName);
    fs.writeFileSync(path.join(resultsDir, experienceSiteFileName), html);
  }

  private static generateReportForFlexipage(
    result: FlexiPageAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages
  ): void {
    Logger.captureVerboseData('flexipage data', result);
    const data: ReportParam = {
      title: 'FlexiPages Migration Report',
      heading: 'FlexiPages Migration Report',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toLocaleString(),
      total: result.length,
      filterGroups: [...this.getStatusFilterGroup(result.map((item) => item.status))],
      headerGroups: [
        {
          header: [
            {
              name: 'FlexiPage Name',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'File Reference',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Status',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Code Difference',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Summary',
              colspan: 1,
              rowspan: 1,
            },
          ],
        },
      ],
      rows: result.map((item) => ({
        rowId: `${this.rowClass}${this.rowId++}`,
        data: [
          createRowDataParam(
            'name',
            item.name.substring(0, item.name.length - this.flexiPageFileSuffix.length),
            true,
            1,
            1,
            false
          ),
          createRowDataParam('path', item.name, false, 1, 1, true, item.path),
          createRowDataParam(
            'status',
            item.status,
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            item.status === 'Successfully migrated' ? 'text-success' : 'text-error'
          ),
          createRowDataParam('diff', '', false, 1, 1, false, undefined, FileDiffUtil.getDiffHTML(item.diff, item.name)),
          createRowDataParam(
            'error',
            'error',
            false,
            1,
            1,
            false,
            undefined,
            item.errors,
            item.status === 'Successfully migrated' ? '' : 'text-error'
          ),
        ],
      })),
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, flexipageFileName), html);
  }

  private static generateReportForApex(
    result: ApexAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages
  ): void {
    Logger.captureVerboseData('apex data', result);
    const data: ReportParam = {
      title: 'Apex Classes Migration Report',
      heading: 'Apex Classes Migration Report',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toLocaleString(),
      total: result.length,
      filterGroups: [createFilterGroupParam('Filter by Errors', 'warnings', ['Failed', 'Successfully Completed'])],
      headerGroups: [
        {
          header: [
            {
              name: 'Name',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'File Reference',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Status',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Code Difference',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Summary',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Errors',
              colspan: 1,
              rowspan: 1,
            },
          ],
        },
      ],
      rows: result.map((item) => ({
        rowId: `${this.rowClass}${this.rowId++}`,
        data: [
          createRowDataParam('name', item.name, true, 1, 1, false),
          createRowDataParam('path', item.name, false, 1, 1, true, item.path, item.name + '.cls'),
          createRowDataParam(
            'status',
            this.getStatusFromErrors(item.errors),
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            this.getStatusCssClass(item.errors)
          ),
          createRowDataParam(
            'diff',
            item.name + 'diff',
            false,
            1,
            1,
            false,
            undefined,
            FileDiffUtil.getDiffHTML(item.diff, item.name)
          ),
          createRowDataParam(
            'infos',
            item.infos ? item.infos.join(', ') : '',
            false,
            1,
            1,
            false,
            undefined,
            item.infos,
            this.getStatusCssClass(item.errors, true)
          ),
          createRowDataParam(
            'warnings',
            item.warnings.length > 0 ? 'Failed' : 'Successfully Completed',
            false,
            1,
            1,
            false,
            undefined,
            [...item.warnings, ...item.errors],
            this.getStatusCssClass(item.errors, true)
          ),
        ],
      })),
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, apexFileName), html);

    // call generate html from template
  }

  private static generateReportForLwc(
    result: LWCAssessmentInfo[],
    instanceUrl: string,
    orgDetails: OmnistudioOrgDetails,
    messages: Messages
  ): void {
    Logger.captureVerboseData('lwc data', result);
    const data: ReportParam = {
      title: 'Lightning Web Components Migration Report',
      heading: 'Lightning Web Components Migration Report',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toLocaleString(),
      total: result.length,
      filterGroups: [...this.getStatusFilterGroup(result.flatMap((item) => this.getStatusFromErrors(item.errors)))],
      headerGroups: [
        {
          header: [
            {
              name: 'Name',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Status',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'File Reference',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'File Diff',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Migration Status',
              colspan: 1,
              rowspan: 1,
            },
            {
              name: 'Errors',
              colspan: 1,
              rowspan: 1,
            },
          ],
        },
      ],
      rows: this.getLwcRowsForReport(result),
    };

    const reportTemplate = fs.readFileSync(reportTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(reportTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, lwcFileName), html);
  }

  private static getLwcRowsForReport(lwcAssessmentInfos: LWCAssessmentInfo[]): ReportRowParam[] {
    const rows: ReportRowParam[] = [];

    for (const lwcAssessmentInfo of lwcAssessmentInfos) {
      let showCommon = true;
      const rid = `${this.rowClass}${this.rowId++}`;
      const commonRowSpan = Math.max(1, lwcAssessmentInfo.changeInfos.length);
      for (const fileChangeInfo of lwcAssessmentInfo.changeInfos) {
        rows.push({
          rowId: rid,
          data: [
            ...(showCommon
              ? [
                  createRowDataParam('name', lwcAssessmentInfo.name, true, commonRowSpan, 1, false),
                  createRowDataParam(
                    'status',
                    this.getStatusFromErrors(lwcAssessmentInfo.errors),
                    false,
                    commonRowSpan,
                    1,
                    false,
                    undefined,
                    undefined,
                    this.getStatusCssClass(lwcAssessmentInfo.errors)
                  ),
                ]
              : []),
            createRowDataParam(
              'fileReference',
              fileChangeInfo.name,
              false,
              1,
              1,
              true,
              fileChangeInfo.path,
              fileChangeInfo.name
            ),
            createRowDataParam(
              'diff',
              fileChangeInfo.name + 'diff',
              false,
              1,
              1,
              false,
              undefined,
              FileDiffUtil.getDiffHTML(fileChangeInfo.diff, fileChangeInfo.name)
            ),
            ...(showCommon
              ? [
                  createRowDataParam(
                    'comments',
                    lwcAssessmentInfo.warnings && lwcAssessmentInfo.warnings.length > 0
                      ? 'Failed'
                      : 'Successfully Completed',
                    false,
                    commonRowSpan,
                    1,
                    false,
                    undefined,
                    lwcAssessmentInfo.warnings || [],
                    this.getStatusCssClass(lwcAssessmentInfo.errors, true)
                  ),
                  createRowDataParam(
                    'errors',
                    lwcAssessmentInfo.errors ? lwcAssessmentInfo.errors.join(', ') : '',
                    false,
                    commonRowSpan,
                    1,
                    false,
                    undefined,
                    lwcAssessmentInfo.errors || [],
                    this.getStatusCssClass(lwcAssessmentInfo.errors, true)
                  ),
                ]
              : []),
          ],
        });
        showCommon = false;
      }
    }

    return rows;
  }

  private static generateMigrationReportDashboard(
    orgDetails: OmnistudioOrgDetails,
    results: MigratedObject[],
    relatedObjectMigrationResult: RelatedObjectAssesmentInfo,
    messages: Messages,
    actionItems: string[],
    objectsToProcess: string[]
  ): void {
    const relatedObjectSummaryItems: SummaryItemParam[] = [];
    if (objectsToProcess.includes(Constants.Apex)) {
      relatedObjectSummaryItems.push({
        name: 'Apex Classes',
        total: relatedObjectMigrationResult.apexAssessmentInfos?.length || 0,
        data: this.getDifferentStatusDataForApex(relatedObjectMigrationResult.apexAssessmentInfos),
        file: apexFileName,
      });
    }
    if (objectsToProcess.includes(Constants.ExpSites)) {
      relatedObjectSummaryItems.push({
        name: 'Experience Sites',
        total: relatedObjectMigrationResult.experienceSiteAssessmentInfos?.length || 0,
        data: this.getDifferentStatusDataForExperienceSites(relatedObjectMigrationResult.experienceSiteAssessmentInfos),
        file: experienceSiteFileName,
      });
    }
    if (objectsToProcess.includes(Constants.FlexiPage)) {
      relatedObjectSummaryItems.push({
        name: 'FlexiPages',
        total: relatedObjectMigrationResult.flexipageAssessmentInfos?.length || 0,
        data: this.getDifferentStatusDataForFlexipage(relatedObjectMigrationResult.flexipageAssessmentInfos),
        file: flexipageFileName,
      });
    }
    if (objectsToProcess.includes(Constants.LWC)) {
      relatedObjectSummaryItems.push({
        name: 'Lightning Web Components',
        total: relatedObjectMigrationResult.lwcAssessmentInfos?.length || 0,
        data: this.getDifferentStatusDataForLwc(relatedObjectMigrationResult.lwcAssessmentInfos),
        file: lwcFileName,
      });
    }

    const data: DashboardParam = {
      title: 'Omnistudio Migration Report Dashboard',
      heading: 'Omnistudio Migration Report Dashboard',
      org: {
        name: orgDetails.orgDetails.Name,
        id: orgDetails.orgDetails.Id,
        namespace: orgDetails.packageDetails.namespace,
        dataModel: orgDetails.dataModel,
      },
      assessmentDate: new Date().toLocaleString(),
      summaryItems: [
        ...results.map((result) => {
          // Handle custom labels specially for pagination and status calculation
          if (result.name.toLowerCase().includes('custom labels')) {
            const totalLabels = result.data?.length || 0;
            const totalPages = Math.ceil(totalLabels / 1000);
            const fileName = totalPages > 1 ? `Custom_Labels_Page_1_of_${totalPages}.html` : 'Custom_Labels.html';

            return {
              name: result.name,
              total: totalLabels,
              data: this.getCustomLabelStatusData(result.data),
              file: fileName,
            };
          }

          return {
            name: `${getMigrationHeading(result.name)}`,
            total: result.data?.length || 0,
            data: this.getDifferentStatusDataForResult(result.data),
            file: result.name.replace(/ /g, '_').replace(/\//g, '_') + '.html',
          };
        }),
        ...relatedObjectSummaryItems,
      ],
      actionItems,
      mode: 'migrate',
    };

    const dashboardTemplate = fs.readFileSync(dashboardTemplateFilePath, 'utf8');
    const html = TemplateParser.generate(dashboardTemplate, data, messages);
    fs.writeFileSync(path.join(resultsDir, 'dashboard.html'), html);
  }

  private static getDifferentStatusDataForResult(
    data: MigratedRecordInfo[]
  ): Array<{ name: string; count: number; cssClass: string }> {
    let complete = 0;
    let error = 0;
    let skip = 0;
    data.forEach((item) => {
      if (item.status === 'Successfully migrated') complete++;
      if (item.status === 'Failed') error++;
      if (item.status === 'Skipped') skip++;
    });
    return [
      { name: 'Successfully migrated', count: complete, cssClass: 'text-success' },
      { name: 'Skipped', count: skip, cssClass: 'text-error' },
      { name: 'Failed', count: error, cssClass: 'text-error' },
    ];
  }

  private static getCustomLabelStatusData(
    data: MigratedRecordInfo[]
  ): Array<{ name: string; count: number; cssClass: string }> {
    let created = 0;
    let error = 0;
    let duplicate = 0;
    data.forEach((item) => {
      // Handle both old and new status formats
      const status = item.status || (item as any).cloneStatus;
      if (status === 'created' || status === 'Complete') created++;
      else if (status === 'error' || status === 'Error') error++;
      else if (status === 'duplicate' || status === 'Skipped') duplicate++;
    });
    return [
      { name: 'Created', count: created, cssClass: 'text-success' },
      { name: 'Failed', count: error, cssClass: 'text-error' },
      { name: 'Duplicate', count: duplicate, cssClass: 'text-warning' },
    ];
  }

  private static getDifferentStatusDataForApex(
    data: ApexAssessmentInfo[] | ExperienceSiteAssessmentInfo[]
  ): Array<{ name: string; count: number; cssClass: string }> {
    let complete = 0;
    let error = 0;
    data.forEach((item: ApexAssessmentInfo | ExperienceSiteAssessmentInfo) => {
      if (this.getStatusFromErrors(item.errors) === 'Successfully migrated') complete++;
      else error++;
    });
    return [
      { name: 'Successfully migrated', count: complete, cssClass: 'text-success' },
      { name: 'Skipped', count: 0, cssClass: 'text-error' },
      { name: 'Failed', count: error, cssClass: 'text-error' },
    ];
  }

  private static getDifferentStatusDataForFlexipage(data: FlexiPageAssessmentInfo[]): SummaryItemDetailParam[] {
    let completed = 0;
    let skipped = 0;
    let failed = 0;
    data.forEach((item) => {
      if (item.status === 'Successfully migrated') completed++;
      else if (item.status === 'Skipped') skipped++;
      else failed++;
    });

    return [
      { name: 'Successfully migrated', count: completed, cssClass: 'text-success' },
      { name: 'Skipped', count: skipped, cssClass: 'text-error' },
      { name: 'Failed', count: failed, cssClass: 'text-error' },
    ];
  }

  private static getDifferentStatusDataForLwc(data: LWCAssessmentInfo[]): SummaryItemDetailParam[] {
    let completed = 0;
    let failed = 0;
    data.forEach((item) => {
      if (this.getStatusFromErrors(item.errors) === 'Successfully migrated') completed++;
      else failed++;
    });

    return [
      { name: 'Successfully migrated', count: completed, cssClass: 'text-success' },
      { name: 'Skipped', count: 0, cssClass: 'text-error' },
      { name: 'Failed', count: failed, cssClass: 'text-error' },
    ];
  }

  private static getDifferentStatusDataForExperienceSites(
    data: ExperienceSiteAssessmentInfo[]
  ): SummaryItemDetailParam[] {
    let completed = 0;
    let skipped = 0;
    let failed = 0;
    data.forEach((item) => {
      if (item.status === 'Successfully migrated') completed++;
      else if (item.status === 'Skipped') skipped++;
      else failed++;
    });

    return [
      { name: 'Successfully migrated', count: completed, cssClass: 'text-success' },
      { name: 'Skipped', count: skipped, cssClass: 'text-error' },
      { name: 'Failed', count: failed, cssClass: 'text-error' },
    ];
  }

  private static getStatusFilterGroup(statuses: string[]): FilterGroupParam[] {
    const statusSet = new Set(statuses);
    if (statusSet.size === 0) return [];
    return [createFilterGroupParam('Filter by Status', 'status', Array.from(statusSet))];
  }

  private static getStatusFromErrors(errors: string[]): string {
    if (errors && errors.length > 0) return 'Failed';
    return 'Successfully migrated';
  }

  private static getStatusCssClass(errors: string[], neutralSuccess = false): string {
    if (errors && errors.length > 0) return 'text-error';
    if (neutralSuccess) return '';
    return 'text-success';
  }
}
