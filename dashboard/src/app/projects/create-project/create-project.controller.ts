/*
 * Copyright (c) 2015-2017 Codenvy, S.A.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Codenvy, S.A. - initial API and implementation
 */
'use strict';
import {CheAPI} from '../../../components/api/che-api.factory';
import {CheStack} from '../../../components/api/che-stack.factory';
import {CreateProjectSvc} from './create-project.service';
import {CheNotification} from '../../../components/notification/che-notification.factory';
import {CheEnvironmentRegistry} from '../../../components/api/environment/che-environment-registry.factory';
import {IEnvironmentManagerMachine} from '../../../components/api/environment/environment-manager-machine';

/**
 * This class is handling the controller for the projects
 * @author Florent Benoit
 */
export class CreateProjectController {
  $document: ng.IDocumentService;
  $location: ng.ILocationService;
  $log: ng.ILogService;
  $mdDialog: ng.material.IDialogService;
  $q: ng.IQService;
  $rootScope: che.IRootScopeService;
  $scope: ng.IScope;
  $timeout: ng.ITimeoutService;
  $websocket: ng.websocket.IWebSocketProvider;
  $window: ng.IWindowService;
  createProjectSvc: CreateProjectSvc;
  lodash: any;
  cheNotification: CheNotification;
  cheAPI: CheAPI;
  cheStack: CheStack;
  cheEnvironmentRegistry: CheEnvironmentRegistry;

  stackMachines: any;
  importProjectData: che.IImportProject;
  enableWizardProject: boolean;
  currentStackTags: any;
  stacksInitialized: boolean;
  workspaces: any[];
  selectSourceOption: string;
  templatesChoice: string;
  workspaceRam: number;
  websocketReconnect: number;
  messageBus: any;
  selectedTabIndex: number;
  currentTab: string;
  state: string;
  forms: Map<string, ng.IFormController>;
  jsonConfig: any;
  isReady: boolean;
  listeningChannels: any[];
  defaultProjectName: string;
  projectName: string;
  defaultProjectDescription: string;
  projectDescription: string;
  workspaceName: string;
  stackLibraryOption: string;
  existingWorkspaceName: string;
  defaultWorkspaceName: string;
  workspaceResource: any;
  workspaceSelected: any;
  workspaceConfig: any;
  stack: any;
  isCustomStack: boolean;
  isHandleClose: boolean;
  connectionClosed: Function;

  workspaceResourceForm: ng.IFormController;
  workspaceInformationForm: ng.IFormController;
  projectInformationForm: ng.IFormController;

  private stackId: string;
  private stacks: Array<che.IStack>;

  /**
   * Default constructor that is using resource
   * @ngInject for Dependency injection
   */
  constructor($document: ng.IDocumentService, $filter: ng.IFilterService, $location: ng.ILocationService,
              $log: ng.ILogService, $mdDialog: ng.material.IDialogService, $rootScope: che.IRootScopeService,
              $routeParams: che.route.IRouteParamsService, $q: ng.IQService, $scope: ng.IScope,
              $timeout: ng.ITimeoutService, $websocket: ng.websocket.IWebSocketProvider, $window: ng.IWindowService,
              lodash: any, cheAPI: CheAPI, cheStack: CheStack, createProjectSvc: CreateProjectSvc,
              cheNotification: CheNotification, cheEnvironmentRegistry: CheEnvironmentRegistry) {
    this.$log = $log;
    this.cheAPI = cheAPI;
    this.cheStack = cheStack;
    this.$websocket = $websocket;
    this.$timeout = $timeout;
    this.$location = $location;
    this.$mdDialog = $mdDialog;
    this.$scope = $scope;
    this.$rootScope = $rootScope;
    this.createProjectSvc = createProjectSvc;
    this.lodash = lodash;
    this.cheNotification = cheNotification;
    this.$q = $q;
    this.$document = $document;
    this.$window = $window;
    this.cheEnvironmentRegistry = cheEnvironmentRegistry;
    this.stackMachines = {};

    this.resetCreateProgress();

    // jSON used for import data
    this.importProjectData = this.getDefaultProjectJson();

    this.enableWizardProject = true;

    this.currentStackTags = null;

    // stacks not yet completed
    this.stacksInitialized = false;

    // keep references on workspaces and projects
    this.workspaces = [];

    // default options
    this.selectSourceOption = 'select-source-new';

    this.templatesChoice = 'templates-samples';

    // default RAM value for workspaces
    this.workspaceRam = 2 * Math.pow(1024, 3);
    this.websocketReconnect = 50;

    this.generateWorkspaceName();

    this.messageBus = null;

    // search the selected tab
    let routeParams = $routeParams.tabName;
    if (!routeParams) {
      this.selectedTabIndex = 0;
    } else {
      switch (routeParams) {
        case 'blank':
          this.selectedTabIndex = 0;
          break;
        case 'samples':
          this.selectedTabIndex = 1;
          break;
        case 'git':
          this.selectedTabIndex = 2;
          break;
        case 'github':
          this.selectedTabIndex = 3;
          break;
        case 'zip':
          this.selectedTabIndex = 4;
          break;
        case 'config':
          this.selectedTabIndex = 2;
          break;
        default:
          $location.path('/create-project');
      }
    }

    if (cheStack.getStacks().length) {
      this.updateWorkspaces();
    } else {
      cheStack.fetchStacks().then(() => {
        this.updateWorkspaces();
      }, (error: any) => {
        if (error.status === 304) {
          this.updateWorkspaces();
          return;
        }
        this.state = 'error';
      });
    }

    // selected current tab
    this.currentTab = '';
    // all forms that we have
    this.forms = new Map();

    this.jsonConfig = {};
    this.jsonConfig.content = '{}';
    try {
      this.jsonConfig.content = $filter('json')(angular.fromJson(this.importProjectData), 2);
    } catch (e) {
      // ignore the error
    }

    let deregFunc1 = $rootScope.$on('create-project-stacks:initialized', () => {
      this.stacksInitialized = true;
    });

    // sets isReady status after selection
    let deregFunc2 = $rootScope.$on('create-project-github:selected', () => {
      if (!this.isReady && this.currentTab === 'github') {
        this.isReady = true;
      }
    });
    let deregFunc3 = $rootScope.$on('create-project-samples:selected', () => {
      if (!this.isReady && this.currentTab === 'samples') {
        this.isReady = true;
      }
    });
    $rootScope.$on('$destroy', () => {
      deregFunc1();
      deregFunc2();
      deregFunc3();
    });

    // channels on which we will subscribe on the workspace bus websocket
    this.listeningChannels = [];

    this.projectName = null;
    this.projectDescription = null;
    this.defaultWorkspaceName = null;

    cheAPI.getWorkspace().getWorkspaces();

    $rootScope.showIDE = false;

    this.isHandleClose = true;
    this.connectionClosed = () => {
      if (!this.isHandleClose) {
        return;
      }

      this.$mdDialog.show(
        this.$mdDialog.alert()
          .title('Connection error')
          .content('Unable to track the workspace status due to connection closed error. Please, try again or restart the page.')
          .ariaLabel('Workspace start')
          .ok('OK')
      );
    };

    this.stacks = cheStack.getStacks();
    if (!this.stacks || !this.stacks.length) {
      cheStack.fetchStacks();
    }
  }

  /**
   * Gets object keys from target object.
   *
   * @param targetObject
   * @returns [*]
   */
  getObjectKeys(targetObject: any): string[] {
    return Object.keys(targetObject);
  }

  /**
   * Fetch workspaces when initializing
   */
  updateWorkspaces(): void {
    this.workspaces = this.cheAPI.getWorkspace().getWorkspaces();
      // fetch workspaces when initializing
    let promise = this.cheAPI.getWorkspace().fetchWorkspaces();
    promise.then(() => {
        this.updateData();
      },
      (error: any) => {
        // retrieve last data that were fetched before
        if (error.status === 304) {
          // ok
          this.updateData();
          return;
        }
        this.state = 'error';
      });
  }

  /**
   * Gets default project JSON used for import data
   */
  getDefaultProjectJson(): che.IImportProject {
    return {
      source: {
        location: '',
        parameters: {}
      },
      project: {
        name: '',
        description: ''
      }
    };
  }

  /**
   * Fetching operation has been done, so get workspaces and websocket connection
   */
  updateData(): void {
    this.workspaceResource = this.workspaces.length > 0 ? 'existing-workspace' : 'from-stack';
    // if create project in progress and workspace have started
    if (this.createProjectSvc.isCreateProjectInProgress() && this.createProjectSvc.getCurrentProgressStep() > 0) {
      let workspaceName = this.createProjectSvc.getWorkspaceOfProject();
      let findWorkspace = this.lodash.find(this.workspaces, (workspace: any) => {
        return workspace.config.name === workspaceName;
      });
      // check current workspace
      if (findWorkspace) {
        // init WS bus
        this.messageBus = this.cheAPI.getWebsocket().getBus();
      } else {
        this.resetCreateProgress();
      }
    } else {
      let preselectWorkspaceId = this.$location.search().workspaceId;
      if (preselectWorkspaceId) {
        this.workspaceSelected = this.lodash.find(this.workspaces, (workspace: any) => {
          return workspace.id === preselectWorkspaceId;
        });
      }
      // generate project name
      this.generateProjectName(true);
    }
  }

  /**
   * Force codemirror editor to be refreshed
   */
  refreshCM(): void {
    // hack to make a refresh of the zone
    this.importProjectData.cm = 'aaa';
    this.$timeout(() => {
      delete this.importProjectData.cm;
    }, 500);
  }

  /**
   * Update internal json data from JSON codemirror editor config file
   */
  update(): void {
    try {
      this.importProjectData = angular.fromJson(this.jsonConfig.content);
    } catch (e) {
      // invalid JSON, ignore
    }

  }


  /**
   * Select the given github repository
   * @param gitHubRepository the repository selected
   */
  selectGitHubRepository(gitHubRepository: any): void {
    this.setProjectName(gitHubRepository.name);
    this.setProjectDescription(gitHubRepository.description);
    this.importProjectData.source.location = gitHubRepository.clone_url;
  }


  /**
   * Checks if the current forms are being validated
   * @returns {boolean|FormController.$valid|*|ngModel.NgModelController.$valid|context.ctrl.$valid|Ic.$valid}
   */
  checkValidFormState(): boolean {
    // check workspace resource form
    if (this.workspaceResourceForm && this.workspaceResourceForm.$invalid) {
      return false;
    }

    // check workspace information form
    if (this.workspaceInformationForm && this.workspaceInformationForm.$invalid) {
      return false;
    }

    // check project information form and selected tab form
    if (this.selectSourceOption === 'select-source-new') {
      return this.projectInformationForm && this.projectInformationForm.$valid;
    } else if (this.selectSourceOption === 'select-source-existing') {
      let currentForm = this.forms.get(this.currentTab);
      if (currentForm) {
        return this.projectInformationForm && this.projectInformationForm.$valid && currentForm.$valid;
      }
    }
  }

  /**
   * Defines the project information form
   * @param form
   */
  setProjectInformationForm(form: ng.IFormController): void {
    this.projectInformationForm = form;
  }

  setWorkspaceResourceForm(form: ng.IFormController): void {
    this.workspaceResourceForm = form;
  }

  setWorkspaceInformationForm(form: ng.IFormController): void {
    this.workspaceInformationForm = form;
  }

  /**
   * Sets the form for a given mode
   * @param form the selected form
   * @param mode the tab selected
   */
  setForm(form: ng.IFormController, mode: string): void {
    this.forms.set(mode, form);
  }

  /**
   * Sets the current selected tab
   * @param tab the selected tab
   */
  setCurrentTab(tab: string): void {
    this.currentTab = tab;
    this.importProjectData = this.getDefaultProjectJson();

    if ('blank' === tab) {
      this.importProjectData.project.type = 'blank';
    } else if ('git' === tab || 'github' === tab) {
      this.importProjectData.source.type = 'git';
    } else if ('zip' === tab) {
      this.importProjectData.project.type = '';
      this.importProjectData.source.type = 'zip';
    } else if ('config' === tab) {
      this.importProjectData.project.type = 'blank';
      this.importProjectData.source.type = 'git';
      // try to set default values
      this.setProjectDescription(this.importProjectData.project.description);
      this.setProjectName(this.importProjectData.project.name);
      this.refreshCM();
    }
    // github and samples tabs have broadcast selection events for isReady status
    this.isReady = !('github' === tab || 'samples' === tab);
  }

  /**
   * Returns current selected tab
   * @returns {string|*}
   */
  getCurrentTab(): string {
    return this.currentTab;
  }

  startWorkspace(bus: any, workspace: che.IWorkspace): ng.IPromise<any> {
    // then we've to start workspace
    this.createProjectSvc.setCurrentProgressStep(1);

    let statusLink = this.lodash.find(workspace.links, (link: any) => {
      return link.rel === 'environment.status_channel';
    });

    let outputLink = this.lodash.find(workspace.links, (link: any) => {
      return link.rel === 'environment.output_channel';
    });

    let workspaceId = workspace.id;

    let agentChannel = 'workspace:' + workspace.id + ':ext-server:output';
    let statusChannel = statusLink ? statusLink.parameters[0].defaultValue : null;
    let outputChannel = outputLink ? outputLink.parameters[0].defaultValue : null;

    this.listeningChannels.push(agentChannel);
    bus.subscribe(agentChannel, (message: any) => {
      if (this.createProjectSvc.getCurrentProgressStep() < 2) {
        this.createProjectSvc.setCurrentProgressStep(2);
      }
      let agentStep = 2;
      if (this.getCreationSteps()[agentStep].logs.length > 0) {
        this.getCreationSteps()[agentStep].logs = this.getCreationSteps()[agentStep].logs + '\n' + message;
      } else {
        this.getCreationSteps()[agentStep].logs = message;
      }
    });

    if (statusChannel) {
      // for now, display log of status channel in case of errors
      this.listeningChannels.push(statusChannel);
      bus.subscribe(statusChannel, (message: any) => {
        message = this.getDisplayMachineLog(message);
        if (message.eventType === 'DESTROYED' && message.workspaceId === workspace.id) {
          this.getCreationSteps()[this.getCurrentProgressStep()].hasError = true;

          // need to show the error
          this.$mdDialog.show(
              this.$mdDialog.alert()
                  .title('Unable to start workspace')
                  .content('Unable to start workspace. It may be linked to OutOfMemory or the container has been destroyed')
                  .ariaLabel('Workspace start')
                  .ok('OK')
          );
        }
        if (message.eventType === 'ERROR' && message.workspaceId === workspace.id) {
          this.getCreationSteps()[this.getCurrentProgressStep()].hasError = true;
          let errorMessage = 'Error when trying to start the workspace';
          if (message.error) {
            errorMessage += ': ' + message.error;
          } else {
            errorMessage += '.';
          }
          // need to show the error
          this.$mdDialog.show(
              this.$mdDialog.alert()
                  .title('Error when starting workspace')
                  .content('Unable to start workspace. ' + errorMessage)
                  .ariaLabel('Workspace start')
                  .ok('OK')
          );
        }
        this.$log.log('Status channel of workspaceID', workspaceId, message);
      });
    }

    if (outputChannel) {
      this.listeningChannels.push(outputChannel);
      bus.subscribe(outputChannel, (message: any) => {
        message = this.getDisplayMachineLog(message);
        if (this.getCreationSteps()[this.getCurrentProgressStep()].logs.length > 0) {
          this.getCreationSteps()[this.getCurrentProgressStep()].logs = this.getCreationSteps()[this.getCurrentProgressStep()].logs + '\n' + message;
        } else {
          this.getCreationSteps()[this.getCurrentProgressStep()].logs = message;
        }
      });
    }



    let startWorkspacePromise = this.cheAPI.getWorkspace().startWorkspace(workspace.id, workspace.config.defaultEnv);
    bus.onClose(this.connectionClosed);
    startWorkspacePromise.then(() => {
      // update list of workspaces
      // for new workspace to show in recent workspaces
      this.cheAPI.cheWorkspace.fetchWorkspaces();
    }, (error: any) => {
      let errorMessage;

      if (!error || !error.data) {
        errorMessage = 'Unable to start this workspace.';
      } else if (error.data.errorCode === 10000 && error.data.attributes) {
        let attributes = error.data.attributes;

        errorMessage = 'Unable to start this workspace.' +
        ' There are ' + attributes.workspaces_count + ' running workspaces consuming ' +
        attributes.used_ram + attributes.ram_unit + ' RAM.' +
        ' Your current RAM limit is ' + attributes.limit_ram + attributes.ram_unit +
        '. This workspace requires an additional ' +
        attributes.required_ram + attributes.ram_unit + '.' +
        '  You can stop other workspaces to free resources.';
      } else {
        errorMessage = error.data.message;
      }

      this.cheNotification.showError(errorMessage);
      this.getCreationSteps()[this.getCurrentProgressStep()].logs = errorMessage;
      this.getCreationSteps()[this.getCurrentProgressStep()].hasError = true;
    });
    return  startWorkspacePromise;
  }

  /**
   * Gets the log to be displayed per machine.
   *
   * @param log origin log content
   * @returns {*} parsed log
   */
  getDisplayMachineLog(log: any): string {
    log = angular.fromJson(log);
    if (angular.isObject(log)) {
      return '[' + log.machineName + '] ' + log.content;
    } else {
      return log;
    }
  }

  createProjectInWorkspace(workspaceId: string, projectName: string, projectData: any, bus: any, websocketStream?: any, workspaceBus?: any): void {
    this.updateRecentWorkspace(workspaceId);

    this.createProjectSvc.setCurrentProgressStep(3);

    let promise;
    let channel: string = null;
    // select mode (create or import)
    if (this.selectSourceOption === 'select-source-new' && this.templatesChoice === 'templates-wizard') {

      // we do not create project as it will be done through wizard
      let deferred = this.$q.defer();
      promise = deferred.promise;
      deferred.resolve(true);

    } else {

      // if it's a user-defined location we need to cleanup commands that may have been configured by templates
      if (this.selectSourceOption === 'select-source-existing') {
        projectData.project.commands = [];
      }

      // websocket channel
      channel = 'importProject:output';

      // on import
      bus.subscribe(channel, (message: any) => {
        this.getCreationSteps()[this.getCurrentProgressStep()].logs = message.line;
      });

      let deferredImport = this.$q.defer();
      let deferredImportPromise = deferredImport.promise;
      let deferredAddCommand = this.$q.defer();
      let deferredAddCommandPromise = deferredAddCommand.promise;
      let deferredResolve = this.$q.defer();
      let deferredResolvePromise = deferredResolve.promise;

      let projects = this.processMultiproject(projectData);
      let importPromise = this.cheAPI.getWorkspace().getWorkspaceAgent(workspaceId).getProject().createProjects(projects);

      importPromise.then(() => {
        // add commands if there are some that have been defined
        let commands = projectData.project.commands;
        if (commands && commands.length > 0) {
          this.addCommand(workspaceId, projectName, commands, 0, deferredAddCommand);
        } else {
          deferredAddCommand.resolve('no commands to add');
        }
        deferredImport.resolve();
      }, (error: any) => {
        deferredImport.reject(error);
      });

      // now, resolve the project
      deferredAddCommandPromise.then(() => {
        this.resolveProjectType(workspaceId, projectName, projectData, deferredResolve);
      });
      promise = this.$q.all([deferredImportPromise, deferredAddCommandPromise, deferredResolvePromise]);
    }
    promise.then(() => {
      this.cheAPI.getWorkspace().fetchWorkspaces();

      this.cleanupChannels(websocketStream, workspaceBus, bus, channel);
      this.createProjectSvc.setCurrentProgressStep(4);

      // redirect to IDE from crane loader page
      let currentPath = this.$location.path();
      if (/create-project/.test(currentPath)) {
        this.createProjectSvc.redirectToIDE();
      }
    }, (error: any) => {
      this.cleanupChannels(websocketStream, workspaceBus, bus, channel);
      this.getCreationSteps()[this.getCurrentProgressStep()].hasError = true;
      // if we have a SSH error
      if (error.data && error.data.errorCode === 32068) {
        this.showAddSecretKeyDialog(projectData.source.location, workspaceId);
        return;
      }
      this.$mdDialog.show({
        bindToController: true,
        clickOutsideToClose: true,
        controller: 'ProjectErrorNotificationController',
        controllerAs: 'projectErrorNotificationController',
        locals: { title: 'Error while creating the project', content: error.statusText + ': ' + error.data.message},
        templateUrl: 'app/projects/create-project/project-error-notification/project-error-notification.html'
      });
    });

  }

  /**
   * Process multi-project and prepare batch of projects to be created.
   *
   * @param projectData project data to process
   * @returns {Array|any} array of projects
   */
  processMultiproject(projectData) {
    let currentPath = '/' + projectData.project.name;

    let projects = projectData.projects || [];
    let project = angular.copy(projectData.project);
    project.path = currentPath;
    project.source = projectData.source;

    // update path of sub-projects:
    projects.forEach((project : any) => {
      let index = project.path.indexOf('/' + project.name);
      project.path = currentPath + project.path.substr(index);
    });

    projects.push(project);
    return projects;
  }

  resolveProjectType(workspaceId: string, projectName: string, projectData: che.IImportProject, deferred: ng.IDeferred<any>): void {
    let workspaceAgent = this.cheAPI.getWorkspace().getWorkspaceAgent(workspaceId);
    let copyProjectData = angular.copy(projectData);
    if (copyProjectData && copyProjectData.project) {
      copyProjectData.project.name = projectName;
    }
    workspaceAgent.getProjectTypeResolver().resolveImportProjectType(copyProjectData).then(() => {
      deferred.resolve();
    }, (error: any) => {
      // a second attempt with type blank
      copyProjectData.project.attributes = {};
      copyProjectData.project.type = 'blank';
      workspaceAgent.getProjectTypeResolver().resolveImportProjectType(copyProjectData).then(() => {
        deferred.resolve();
      }, (error: any) => {
        deferred.reject(error);
      });
      deferred.reject(error);
    });
  }


  /**
   * Show the add ssh key dialog
   * @param repoURL  the repository URL
   * @param workspaceId  the workspace IDL
   */
  showAddSecretKeyDialog(repoURL: string, workspaceId: string): void {
    this.$mdDialog.show({
      bindToController: true,
      clickOutsideToClose: true,
      controller: 'AddSecretKeyNotificationController',
      controllerAs: 'addSecretKeyNotificationController',
      locals: {repoURL: repoURL, workspaceId: workspaceId},
      templateUrl: 'app/projects/create-project/add-ssh-key-notification/add-ssh-key-notification.html'
    });
  }

  /**
   * Cleanup the websocket elements after actions are finished
   */
  cleanupChannels(websocketStream: any, workspaceBus: any, bus: any, channel: any): void {
    this.isHandleClose = false;
    if (websocketStream != null) {
      websocketStream.close();
    }

    if (workspaceBus != null) {
      this.listeningChannels.forEach((channel: string) => {
        workspaceBus.unsubscribe(channel);
      });
      this.listeningChannels.length = 0;
    }

    if (channel != null) {
      bus.unsubscribe(channel);
    }


  }


  /**
   * Add commands sequentially by iterating on the number of the commands.
   * Wait the ack of remote addCommand before adding a new command to avoid concurrent access
   * @param workspaceId the ID of the workspace to use for adding commands
   * @param projectName the name that will be used to prefix the commands inserted
   * @param commands the array to follow
   * @param index the index of the array of commands to register
   * @param deferred
   */
  addCommand(workspaceId: string, projectName: string, commands: any[], index: number, deferred: ng.IDeferred<any>): void {
    if (index < commands.length) {
      let newCommand = angular.copy(commands[index]);

      // update project command lines using current.project.path with actual path based on workspace runtime configuration
      // so adding the same project twice allow to use commands for each project without first selecting project in tree
      let workspace = this.cheAPI.getWorkspace().getWorkspaceById(workspaceId);
      if (workspace && workspace.runtime) {
        let runtime = workspace.runtime.devMachine.runtime;
        if (runtime) {
          let envVar = runtime.envVariables;
          if (envVar) {
            let cheProjectsRoot = envVar['CHE_PROJECTS_ROOT'];
            if (cheProjectsRoot) {
              // replace current project path by the full path of the project
              let projectPath = cheProjectsRoot + '/' + projectName;
              newCommand.commandLine = newCommand.commandLine.replace(/\$\{current.project.path\}/g, projectPath);
            }
          }
        }
      }
      newCommand.name = projectName + ': ' + newCommand.name;
      let addPromise = this.cheAPI.getWorkspace().addCommand(workspaceId, newCommand);
      addPromise.then(() => {
        // call the method again
        this.addCommand(workspaceId, projectName, commands, ++index, deferred);
      }, (error: any) => {
        deferred.reject(error);
      });
    } else {
      deferred.resolve('All commands added');
    }
  }

  connectToExtensionServer(websocketURL: any, workspaceId: string, projectName: string, projectData: any, workspaceBus: any, bus?: any) {

    // try to connect
    let websocketStream = this.$websocket(websocketURL);

    // on success, create project
    websocketStream.onOpen(() => {
      let bus = this.cheAPI.getWebsocket().getExistingBus(websocketStream);
      this.createProjectInWorkspace(workspaceId, projectName, projectData, bus, websocketStream, workspaceBus);
      bus.onClose(this.connectionClosed);
    });

    // on error, retry to connect or after a delay, abort
    websocketStream.onError((error: any) => {
      this.websocketReconnect--;
      if (this.websocketReconnect > 0) {
        this.$timeout(() => {
          this.connectToExtensionServer(websocketURL, workspaceId, projectName, projectData, workspaceBus, bus);
        }, 1000);
      } else {
        this.getCreationSteps()[this.getCurrentProgressStep()].hasError = true;
        this.$log.log('error when starting remote extension', error);
        // need to show the error
        this.$mdDialog.show(
          this.$mdDialog.alert()
            .title('Workspace Connection Error')
            .content('It seems that your workspace is running, but we cannot connect your browser to it. This commonly happens when Che was' +
            ' not configured properly. If your browser is connecting to workspaces running remotely, then you must start Che with the ' +
            '--remote:<ip-address> flag where the <ip-address> is the IP address of the node that is running your Docker workspaces.' +
            'Please restart Che with this flag. You can read about what this flag does and why it is essential at: ' +
            'https://eclipse-che.readme.io/docs/configuration#envrionment-variables')
            .ariaLabel('Project creation')
            .ok('OK')
        );
      }
    });
  }

  /**
   * Call the create operation that may create or import a project
   */
  create(): void {
    this.importProjectData.project.description = this.projectDescription;
    this.importProjectData.project.name = this.projectName;
    this.createProjectSvc.setProject(this.projectName);

    if (this.templatesChoice === 'templates-wizard') {
      this.createProjectSvc.setIDEAction('createProject:projectName=' + this.projectName);
    }

    // reset logs and errors
    this.resetCreateProgress();
    this.setCreateProjectInProgress();

    if (this.workspaceResource === 'existing-workspace') {
      // reuse existing workspace
      this.createProjectSvc.setWorkspaceOfProject(this.workspaceSelected.config.name);
      this.createProjectSvc.setWorkspaceNamespace(this.workspaceSelected.namespace);
      this.checkExistingWorkspaceState(this.workspaceSelected);
    } else if (this.workspaceResource === 'from-stack') {
      // create workspace based on a workspaceConfig
      this.createProjectSvc.setWorkspaceOfProject(this.workspaceName);
      let attributes = this.stack && this.stack.id ? {stackId: this.stack.id} : {};
      this.setEnvironment(this.workspaceConfig);
      let workspaceConfig = this.cheAPI.getWorkspace().formWorkspaceConfig(this.workspaceConfig, this.workspaceName, null, this.workspaceRam);
      this.createWorkspace(workspaceConfig, attributes);

    } else {
      // create workspace based on config
      this.createWorkspace(this.workspaceConfig);
    }
  }

  /**
   * Check whether existing workspace in running (runtime should be present)
   *
   * @param workspace {che.IWorkspace} existing workspace
   */
  checkExistingWorkspaceState(workspace: che.IWorkspace): void {
    if (workspace.status === 'RUNNING') {
      this.cheAPI.getWorkspace().fetchWorkspaceDetails(workspace.id).finally(() => {
        let websocketUrl = this.cheAPI.getWorkspace().getWebsocketUrl(workspace.id);
        if (!websocketUrl) {
          this.getCreationSteps()[this.getCurrentProgressStep()].hasError = true;
          this.$log.error('Unable to create project in workspace. Error when trying to get websocket URL.');
          return;
        }
        // get bus
        let websocketStream = this.$websocket(websocketUrl);
        // on success, create project
        websocketStream.onOpen(() => {
          let bus = this.cheAPI.getWebsocket().getExistingBus(websocketStream);
          this.createProjectInWorkspace(workspace.id, this.projectName, this.importProjectData, bus);
        });
      });
    } else {
      this.subscribeStatusChannel(workspace);
      let bus = this.cheAPI.getWebsocket().getBus();
      this.startWorkspace(bus, workspace);
    }
  }

  /**
   * Subscribe on workspace status channel
   *
   * @param workspace workspace for listening status
   */
  subscribeStatusChannel(workspace: any): void {
    this.cheAPI.getWorkspace().fetchStatusChange(workspace.id, 'ERROR').then((message: any) => {
      this.createProjectSvc.setCurrentProgressStep(2);
      this.getCreationSteps()[this.getCurrentProgressStep()].hasError = true;
      // need to show the error
      this.$mdDialog.show(
        this.$mdDialog.alert()
          .title('Error when starting agent')
          .content('Unable to start workspace agent. Error when trying to start the workspace agent: ' + message.error)
          .ariaLabel('Workspace agent start')
          .ok('OK')
      );
    });
    this.cheAPI.getWorkspace().fetchStatusChange(workspace.id, 'RUNNING').then(() => {
      this.createProjectSvc.setCurrentProgressStep(2);

      this.importProjectData.project.name = this.projectName;

      let promiseWorkspace = this.cheAPI.getWorkspace().fetchWorkspaceDetails(workspace.id);
      promiseWorkspace.then(() => {
        let websocketUrl = this.cheAPI.getWorkspace().getWebsocketUrl(workspace.id),
          bus = this.cheAPI.getWebsocket().getBus();
        // try to connect
        this.websocketReconnect = 10;
        this.connectToExtensionServer(websocketUrl, workspace.id, this.importProjectData.project.name, this.importProjectData, bus);
      });
    });
  }

  /**
   * Create new workspace with workspace config
   *
   * @param workspaceConfig {che.IWorkspaceConfig}
   * @param attributes {any}
   */
  createWorkspace(workspaceConfig: che.IWorkspaceConfig, attributes?: any): void {
    // tODO: no account in che ? it's null when testing on localhost
    let creationPromise = this.cheAPI.getWorkspace().createWorkspaceFromConfig(null, workspaceConfig, attributes);
    creationPromise.then((workspace: any) => {
      this.createProjectSvc.setWorkspaceNamespace(workspace.namespace);
      this.updateRecentWorkspace(workspace.id);

      // init message bus if not there
      if (this.workspaces.length === 0) {
        this.messageBus = this.cheAPI.getWebsocket().getBus();
      }

      this.cheAPI.getWorkspace().fetchWorkspaceDetails(workspace.id).then(() => {
        this.subscribeStatusChannel(workspace);
      });

      this.$timeout(() => {
        let bus = this.cheAPI.getWebsocket().getBus();
        this.startWorkspace(bus, workspace);
      }, 1000);

    }, (error: any) => {
      if (error.data.message) {
        this.getCreationSteps()[this.getCurrentProgressStep()].logs = error.data.message;
      }
      this.getCreationSteps()[this.getCurrentProgressStep()].hasError = true;

    });
  }

  /**
   * Generates a default project name only if user has not entered any data
   * @param firstInit on first init, user do not have yet initialized something
   */
  generateProjectName(firstInit: boolean): void {
    // name has not been modified by the user
    if (firstInit || (this.projectInformationForm.deskname.$pristine && this.projectInformationForm.name.$pristine)) {
      // generate a name

      // starts with project
      let name = 'project';

      // type selected
      if (this.importProjectData.project.type) {
        name = this.importProjectData.project.type.replace(/\s/g, '_');
      }

      name = name + '-' + this.generateRandomStr();

      this.setProjectName(name);
    }

  }

  /**
   * Generates a default workspace name
   */
  generateWorkspaceName(): void {
    // starts with wksp
    let name = 'wksp-' + this.generateRandomStr();
    this.setWorkspaceName(name);
  }

  /**
   * Generates a random string
   *
   * @returns {string}
   */
  generateRandomStr(): string {
    return (('0000' + (Math.random() * Math.pow(36, 4) << 0).toString(36)).slice(-4));
  }

  isImporting(): boolean {
    return this.isCreateProjectInProgress();
  }

  isReadyToCreate(): boolean {
    let isCreateProjectInProgress = this.isCreateProjectInProgress();
    return !isCreateProjectInProgress && this.isReady;
  }

  resetCreateProgress(): void {
    if (this.isResourceProblem()) {
      this.$location.path('/workspaces');
    }
    this.createProjectSvc.resetCreateProgress();
  }

  resetCreateNewProject(): void {
    this.resetCreateProgress();
    this.generateWorkspaceName();
    this.generateProjectName(true);
  }

  showIDE(): void {
    this.$rootScope.showIDE = !this.$rootScope.showIDE;
  }

  getStepText(stepNumber: number): string {
    return this.createProjectSvc.getStepText(stepNumber);
  }

  getCreationSteps(): any[] {
    return this.createProjectSvc.getProjectCreationSteps();
  }

  getCurrentProgressStep(): number {
    return this.createProjectSvc.getCurrentProgressStep();
  }

  isCreateProjectInProgress(): boolean {
    return this.createProjectSvc.isCreateProjectInProgress();
  }

  setCreateProjectInProgress(): void {
    this.createProjectSvc.setCreateProjectInProgress(true);
  }

  getWorkspaceOfProject(): string {
    return this.createProjectSvc.getWorkspaceOfProject();
  }

  getIDELink(): string {
    return this.createProjectSvc.getIDELink();
  }

  isResourceProblem(): boolean {
    let currentCreationStep = this.getCreationSteps()[this.getCurrentProgressStep()];
    return currentCreationStep.hasError && currentCreationStep.logs.indexOf('You can stop other workspaces') >= 0;
  }

  /**
   * Update data for selected workspace
   */
  onWorkspaceChange(): void {
    if (!this.workspaceSelected) {
      return;
    }
    this.setWorkspaceName(this.workspaceSelected.config.name);
    this.updateCurrentStack(this.workspaceSelected.attributes.stackId);
    this.updateWorkspaceStatus(true);
  }

  /**
   * Update creation flow state when source option changes
   */
  onSourceOptionChanged(): void {
    if ('select-source-existing' === this.selectSourceOption) {
      // need to call selection of current tab
      this.setCurrentTab(this.currentTab);
    }
  }

  /**
   * Update creation flow state when workspace resource changes
   */
  workspaceResourceOnChange(): void {
    this.workspaceConfig = undefined;
    if (this.workspaceResource === 'existing-workspace') {
      this.updateWorkspaceStatus(true);
    } else {
      if (this.workspaceResource === 'from-config') {
        this.stack = null;
        this.currentStackTags = null;
      }
      this.updateWorkspaceStatus(false);
    }
  }


  /**
   * Use of an existing stack
   * @param config {che.IWorkspaceConfig}
   * @param stackId {string}
   */
  changeWorkspaceStack(config: che.IWorkspaceConfig, stackId: string) {
    if (this.workspaceResource === 'existing-workspace') {
      return;
    }
    this.workspaceConfig = config;
    this.updateCurrentStack(stackId);
  }

  /**
   * Callback when workspace config in editor is changed
   *
   * @param config {Object} workspace config
   */
  updateWorkspaceConfigImport(config: any): void {
    this.workspaceConfig = angular.copy(config);
    this.stackId = 'config-import-' + this.generateRandomStr();
    this.stack = {
      workspaceConfig: this.workspaceConfig
    };
    this.workspaceName = this.workspaceConfig.name;

    delete this.stackMachines[this.stackId];
  }

  /**
   * Changes workspace name in workspace config provided by user
   *
   * @param form {Object}
   */
  workspaceNameChange(form: ng.IFormController): void {
    if (form.$invalid || !this.workspaceConfig) {
      return;
    }

    this.workspaceConfig.name = this.workspaceName;
  }

  /**
   * Changes workspace RAM in workspace config provided by user
   *
   * @param machineName {string}
   * @param machineRam {number}
   */
  workspaceRamChange(machineName: string, machineRam: number): void {
    if (!this.workspaceConfig) {
      return;
    }

    try {
      let config = this.workspaceConfig,
          machines = config.environments[config.defaultEnv].machines;
      if (machines[machineName]) {
        machines[machineName].attributes.memoryLimitBytes = machineRam;
      } else {
        machines[machineName] = {
          attributes: {
            memoryLimitBytes: machineRam
          }
        };
      }
    } catch (e) {
      this.$log.error('Cannot set memory limit for "' + machineName + '"', e);
    }

  }

  updateWorkspaceStatus(isExistingWorkspace: boolean): void {
    if (isExistingWorkspace) {
      this.stackLibraryOption = 'existing-workspace';
      this.existingWorkspaceName = this.workspaceSelected.config.name;
    } else {
      this.stackLibraryOption = 'new-workspace';
      this.generateWorkspaceName();
      this.existingWorkspaceName = '';
    }
    this.$rootScope.$broadcast('chePanel:disabled', {id: 'create-project-workspace', disabled: isExistingWorkspace});
  }

  /**
   * Update current stack
   * @param {string} stackId
   */
  updateCurrentStack(stackId: string): void {
    let stack: che.IStack = null;
    if (stackId) {
      stack = this.stacks.find((stack: che.IStack) => {
        return stack.id === stackId;
      });
    }
    this.isCustomStack = !stack;
    this.stackId = stack && stack.id ? stack.id : 'custom-stack';
    delete this.stackMachines[this.stackId];
    this.stack = stack;
    this.currentStackTags = stack && stack.tags ? angular.copy(stack.tags) : null;
    if (!stack) {
      return;
    }

    this.templatesChoice = 'templates-samples';
    this.generateProjectName(true);
    // enable wizard only if
    // - ready-to-go-stack with PT
    // - custom stack
    if (stack === null || 'general' !== stack.scope) {
      this.enableWizardProject = true;
      return;
    }
    this.enableWizardProject  = 'Java' === stack.name;
  }

  selectWizardProject(): void {
    this.importProjectData.source.location = '';
  }

  /**
   * Set workspace name
   * @param name
   */
  setWorkspaceName(name: string): void {
    if (!name) {
      return;
    }
    if (!this.defaultWorkspaceName || this.defaultWorkspaceName === this.workspaceName) {
      this.defaultWorkspaceName = name;
      this.workspaceName = angular.copy(name);
    }
  }

  /**
   * Set project name
   * @param name
   */
  setProjectName(name: string): void {
    if (!name) {
      return;
    }
    if (!this.projectName || !this.defaultProjectName || this.defaultProjectName === this.projectName) {
      this.defaultProjectName = name;
      this.projectName = angular.copy(name);
    }
    this.importProjectData.project.name = this.projectName;
  }

  /**
   * Set project description
   * @param description
   */
  setProjectDescription(description: string): void {
    if (!description) {
      return;
    }
    if (!this.projectDescription || !this.defaultProjectDescription || this.defaultProjectDescription === this.projectDescription) {
      this.defaultProjectDescription = description;
      this.projectDescription = angular.copy(description);
    }
    this.importProjectData.project.description = this.projectDescription;
  }

  downloadLogs(): void {
    let logs = '';
    this.getCreationSteps().forEach((step: any) => {
      logs += step.logs + '\n';
    });
    this.$window.open('data:text/csv,' + encodeURIComponent(logs));
  }

  /**
   * Returns list of projects of current workspace
   * @returns {*|Array}
   */
  getWorkspaceProjects(): any[] {
    if (this.workspaceSelected && this.workspaceResource === 'existing-workspace') {
      return this.cheAPI.getWorkspace().getWorkspaceProjects()[this.workspaceSelected.id];
    }
    return [];
  }

  /**
   * Emit event to move workspace immediately
   * to top of the recent workspaces list
   *
   * @param workspaceId
   */
  updateRecentWorkspace(workspaceId: string): any {
    this.$rootScope.$broadcast('recent-workspace:set', workspaceId);
  }

  getStackMachines(environment: any): any {
    let recipeType = environment.recipe.type;
    let environmentManager = this.cheEnvironmentRegistry.getEnvironmentManager(recipeType);

    if (!this.stackMachines[this.stackId] || !this.stackMachines[this.stackId].length) {
      let machines = environmentManager.getMachines(environment);
      machines.forEach((machine: IEnvironmentManagerMachine) => {
        let memoryLimit = environmentManager.getMemoryLimit(machine);
          if (!memoryLimit || memoryLimit === -1) {
            environmentManager.setMemoryLimit(machine, this.workspaceRam);
          }
      });
      this.stackMachines[this.stackId] = machines;
    }

    return this.stackMachines[this.stackId];
  }

  /**
   * Updates the workspace's environment with data entered by user.
   *
   * @param workspace workspace to update
   */
  setEnvironment(workspace: any): void {
    if (!workspace.defaultEnv || !workspace.environments || workspace.environments.length === 0) {
      return;
    }

    let environment = workspace.environments[workspace.defaultEnv];

    if (!environment) {
      return;
    }

    let recipeType = environment.recipe.type;
    let environmentManager = this.cheEnvironmentRegistry.getEnvironmentManager(recipeType);
    let machines = this.getStackMachines(environment);
    let hasDevMachine = machines.some((machine: IEnvironmentManagerMachine) => {
      return environmentManager.isDev(machine);
    });
    if (!hasDevMachine) {
      environmentManager.setDev(machines[0], true);
    }
    workspace.environments[workspace.defaultEnv] = environmentManager.getEnvironment(environment, machines);
  }

}
