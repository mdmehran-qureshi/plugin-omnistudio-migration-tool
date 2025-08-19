import { CustomLabelAssessmentInfo } from '../customLabels';
import { OmnistudioOrgDetails } from '../orgUtils';
import {
  FilterGroupParam,
  ReportHeaderGroupParam,
  ReportParam,
  ReportRowParam,
  SummaryItemDetailParam,
} from '../reportGenerator/reportInterfaces';
import { createRowDataParam, getOrgDetailsForReport } from '../reportGenerator/reportUtil';

export class CustomLabelAssessmentReporter {
  private static rowId = 0;
  private static rowIdPrefix = 'cl-row-data-';

  public static getCustomLabelAssessmentData(
    customLabelAssessmentInfos: CustomLabelAssessmentInfo[],
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    page = 1,
    pageSize = 1000
  ): ReportParam {
    const safeCustomLabelInfos = customLabelAssessmentInfos || [];

    // Sort labels by name for consistent ordering
    const sortedLabels = [...safeCustomLabelInfos].sort((a, b) => a.name.localeCompare(b.name));

    const totalLabels = sortedLabels.length;
    const totalPages = Math.ceil(totalLabels / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedLabels = sortedLabels.slice(startIndex, endIndex);

    const headerGroups = this.getHeaderGroupsForReport();
    const filterGroups = this.getFilterGroupsForReport();
    const rows = this.getRowsForReport(paginatedLabels, instanceUrl);

    const title = 'Custom Label Assessment';
    const heading = 'Custom Labels';

    const result: ReportParam = {
      title,
      heading,
      org: getOrgDetailsForReport(omnistudioOrgDetails),
      assessmentDate: new Date().toString(),
      total: totalLabels,
      filterGroups,
      headerGroups,
      rows,
      rollbackFlags: undefined,
      callToAction: [],
    };

    // Only add pagination if there are multiple pages
    if (totalPages > 1) {
      result.pagination = {
        currentPage: page,
        totalPages,
        pageSize,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        nextPageFile: page < totalPages ? `customlabel_assessment_Page_${page + 1}_of_${totalPages}.html` : undefined,
        previousPageFile: page > 1 ? `customlabel_assessment_Page_${page - 1}_of_${totalPages}.html` : undefined,
      };
    }

    return result;
  }

  public static getSummaryData(customLabelAssessmentInfos: CustomLabelAssessmentInfo[]): SummaryItemDetailParam[] {
    const safeCustomLabelInfos = customLabelAssessmentInfos || [];
    const needManualIntervention = safeCustomLabelInfos.filter(
      (label) => label.assessmentStatus === 'Need Manual Intervention'
    ).length;

    return [
      {
        name: 'Need Manual Intervention',
        count: needManualIntervention,
        cssClass: 'text-warning',
      },
    ];
  }

  private static getRowsForReport(
    customLabelAssessmentInfos: CustomLabelAssessmentInfo[],
    instanceUrl: string
  ): ReportRowParam[] {
    const safeCustomLabelInfos = customLabelAssessmentInfos || [];
    const rows: ReportRowParam[] = [];

    const batchRows = safeCustomLabelInfos.map((info) => {
      return {
        rowId: `${this.rowIdPrefix}${this.rowId++}`,
        data: [
          createRowDataParam('name', info.name || '', true, 1, 1, false),
          createRowDataParam(
            'packageId',
            info.packageId || '<ID>',
            false,
            1,
            1,
            true,
            `${instanceUrl}/${info.packageId}`
          ),
          createRowDataParam(
            'packageValue',
            info.packageValue || '',
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            undefined,
            true
          ),
          createRowDataParam('coreId', info.coreId || '<Core Id>', false, 1, 1, true, `${instanceUrl}/${info.coreId}`),
          createRowDataParam(
            'coreValue',
            info.coreValue || '',
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            undefined,
            true
          ),
          createRowDataParam(
            'assessmentStatus',
            info.assessmentStatus || '',
            false,
            1,
            1,
            false,
            undefined,
            undefined,
            info.assessmentStatus === 'Need Manual Intervention' ? 'text-error' : 'text-success'
          ),
          createRowDataParam('summary', info.summary || '', false, 1, 1, false, undefined, undefined, undefined, true),
        ],
      };
    });

    rows.push(...batchRows);
    return rows;
  }

  private static getHeaderGroupsForReport(): ReportHeaderGroupParam[] {
    return [
      {
        header: [
          {
            name: 'Name',
            colspan: 1,
            rowspan: 2,
          },
          {
            name: 'Package',
            colspan: 2,
            rowspan: 1,
          },
          {
            name: 'Core',
            colspan: 2,
            rowspan: 1,
          },
          {
            name: 'Assessment Status',
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
            name: 'Id',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Value',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Id',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Value',
            colspan: 1,
            rowspan: 1,
          },
        ],
      },
    ];
  }

  private static getFilterGroupsForReport(): FilterGroupParam[] {
    return [
      {
        label: 'Assessment Status',
        key: 'assessmentStatus',
        filters: [{ label: 'Can be Automated' }, { label: 'Need Manual Intervention' }],
      },
    ];
  }
}
