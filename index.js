Ext.define('Utils.AncestorPiAppFilter', {
    alias: 'plugin.UtilsAncestorPiAppFilter',
    mixins: [
        'Ext.AbstractPlugin',
        'Rally.Messageable'
    ],
    extend: 'Ext.Component',

    statics: {
        RENDER_AREA_ID: 'utils-ancestor-pi-app-filter'
    },

    config: {
        /**
         * @cfg {Boolean}
         * The id of the component where the plugin will render its controls
         */
        renderAreaId: 'utils-ancestor-pi-app-filter',

        /**
         * @cfg {Boolean}
         * Set to true to indicate that this component is a publisher of events
         * to other apps using this plugin
         */
        publisher: false,

        /**
         * @cfg {Boolean}
         * Set to false to prevent the '-- None --' selection option if your app can't support
         * querying by a null ancestor (e.g. Lookback _ItemHierarchy)
         */
        allowNoEntry: true,

        /**
         * @cfg {Object}
         * Config applied to the app settings components
         */
        settingsConfig: {},

        /**
         * @cfg {String}
         * Label of the Portfolio Item Type picker
         */
        ancestorLabel: 'With ancestor',

        /**
         * @cfg {Number}
         * Width of the Portfolio Item Type picker label
         */
        ancestorLabelWidth: 110,

        /**
         * @cfg {String}
         * Label of the Portfolio Item Type picker when shown with the ancestor filter
         */
        ownerLabel: 'and owned by',

        /**
         * @cfg {String}
         * Label of the Portfolio Item Type picker when shown by itself
         */
        ownerOnlyLabel: 'Owned by',

        /**
         * @cfg {Number}
         * Width of the Portfolio Item Type picker label
         */
        ownerLabelWidth: 110,


        /**
         * @cfg {Number}
         * Style of the Portfolio Item Type picker label
         */
        labelStyle: 'font-size: medium',

        /**
         * @cfg {Number}
         * Minimum width for single row layout
         */
        singleRowMinWidth: 840
    },

    portfolioItemTypes: [],
    readyDeferred: null,
    piTypesDeferred: null,
    isSubscriber: false,
    changeSubscribers: [],
    publishedValue: {},

    constructor: function(config) {
        this.callParent(arguments);
        this._setupPubSub();
        Ext.tip.QuickTipManager.init();
    },

    initComponent: function() {
        this.callParent(arguments);
        this.addEvents('ready', 'select');
    },

    init: function(cmp) {
        this.cmp = cmp;

        this.cmp.on('resize', this._onCmpResize, this);

        // Get the area where plugin controls will render
        this.renderArea = this.cmp.down('#' + this.renderAreaId);

        // Extend app settings fields
        var cmpGetSettingsFields = this.cmp.getSettingsFields;
        this.cmp.getSettingsFields = function() {
            return this._getSettingsFields(cmpGetSettingsFields.apply(cmp, arguments));
        }.bind(this);

        // Extend app default settings fields
        var appDefaults = this.cmp.defaultSettings;
        appDefaults['Utils.AncestorPiAppFilter.enableAncestorPiFilter2'] = false;
        appDefaults['Utils.AncestorPiAppFilter.projectScope'] = 'current';
        this.cmp.setDefaultSettings(appDefaults);

        // Add the control components then fire ready
        this._addControlCmp().then({
            scope: this,
            success: function() {
                this._setReady()
            }
        });
    },

    notifySubscribers: function() {
        var data = this._getValue();
        _.each(this.changeSubscribers, function(subscriberName) {
            this.publish(subscriberName, data);
        }, this);
    },

    // Return a proimse that resolves to a filter (or null) after both:
    // - the component has finished restoring its state and has an initial value.
    // - portfolio item types have been loaded
    getFilterForType: function(type) {
        var filter;

        var modelName = type.toLowerCase();
        var currentValues = this._getValue();
        if (currentValues.piTypePath) {
            var selectedPiTypePath = currentValues.piTypePath
            var selectedRecord = currentValues.isPiSelected;
            var selectedPi = currentValues.pi;
            var pisAbove = this._piTypeAncestors(modelName, selectedPiTypePath);
            if (selectedRecord && selectedPi != null && pisAbove != null) {
                var property;
                property = this._propertyPrefix(modelName, pisAbove);
                if (property) {
                    filter = new Rally.data.wsapi.Filter({
                        property: property,
                        value: selectedPi
                    });

                }
            }
            else if (selectedPi != null) {
                // Filter out any items of this type because the ancestor pi filter is
                // enabled, but this type doesn't have any pi ancestor types
                filter = new Rally.data.wsapi.Filter({
                    property: 'ObjectID',
                    value: 0
                })
            }
        }

        return filter;
    },

    getIgnoreProjectScope: function() {
        return this._getValue().ignoreProjectScope;
    },

    _setupPubSub: function() {
        if (this.publisher) {
            this.subscribe(this, 'registerChangeSubscriber', function(subscriberName) {
                // Register new unique subscribers
                if (!_.contains(this.changeSubscribers, subscriberName)) {
                    this.changeSubscribers.push(subscriberName)
                }
                this.publish(subscriberName, this._getValue());
            }, this);
            // Ask any existing subscribers to re-register
            this.publish('reRegisterChangeSubscriber');
        }
        else {
            this.subscriberEventName = Rally.getApp().getAppId() + this.$className;
            // Subscribe to a channel dedicated to this app
            this.subscribe(this, this.subscriberEventName, function(data) {
                if (this.intervalTimer) {
                    clearInterval(this.intervalTimer);
                    delete this.intervalTimer;
                }
                if (!this.isSubscriber) {
                    this.isSubscriber = true;
                    this._hideControlCmp();
                }
                this.publishedValue = data;
                this._onSelect();
            }, this);
            // Attempt to register with a publisher (if one exists)
            this.publish('registerChangeSubscriber', this.subscriberEventName);
            this.intervalTimer = setInterval(function() {
                this.publish('registerChangeSubscriber', this.subscriberEventName);
            }.bind(this), 500);
            this.subscribe(this, 'reRegisterChangeSubscriber', function() {
                this.publish('registerChangeSubscriber', this.subscriberEventName);
            }, this);
        }
    },

    _getValue: function() {
        var result = {};
        if (this._isSubscriber()) {
            result = this.publishedValue || {};
        }
        else {
            if (this.piTypeSelector) {
                var selectedPiType = this.piTypeSelector.getRecord();
                if (selectedPiType) {
                    var selectedPiTypePath = selectedPiType.get('TypePath');
                    var selectedRecord = this.piSelector.getRecord();
                    var selectedPi = this.piSelector.getValue();
                    _.merge(result, {
                        piTypePath: selectedPiTypePath,
                        isPiSelected: !!selectedRecord,
                        pi: selectedPi
                    });
                }
            }
            result.ignoreProjectScope = this._ignoreProjectScope();
        }
        return result;
    },

    _setReady: function() {
        this.ready = true;
        this.fireEvent('ready', this);
    },

    _onSelect: function() {
        if (this.ready) {
            this.fireEvent('select', this);
        }
    },

    _getSettingsFields: function(fields) {
        var currentSettings = Rally.getApp().getSettings();
        if (!currentSettings.hasOwnProperty('Utils.AncestorPiAppFilter.projectScope')) {
            currentSettings['Utils.AncestorPiAppFilter.projectScope'] = 'user'
        }
        var pluginSettingsFields = [{
                xtype: 'rallycheckboxfield',
                id: 'Utils.AncestorPiAppFilter.enableAncestorPiFilter2',
                name: 'Utils.AncestorPiAppFilter.enableAncestorPiFilter2',
                fieldLabel: 'Filter artifacts by ancestor portfolio item',
            }, {
                xtype: 'rallyportfolioitemtypecombobox',
                id: 'Utils.AncestorPiAppFilter.defaultPiType',
                name: 'Utils.AncestorPiAppFilter.defaultPiType',
                fieldLabel: "Default Portfolio Item type",
                valueField: 'TypePath',
                allowNoEntry: false,
                defaultSelectionPosition: 'last',
                // Disable the preference enabled combo box plugin so that this control value is app specific
                plugins: [],
            },
            {
                xtype: 'radiogroup',
                fieldLabel: 'Show artifacts from',
                columns: 1,
                vertical: true,
                allowBlank: false,
                items: [{
                    boxLabel: "User's current project(s).",
                    name: 'Utils.AncestorPiAppFilter.projectScope',
                    inputValue: 'current',
                    checked: 'current' === currentSettings['Utils.AncestorPiAppFilter.projectScope']
                }, {
                    boxLabel: "All projects in workspace.",
                    name: 'Utils.AncestorPiAppFilter.projectScope',
                    inputValue: 'workspace',
                    checked: 'workspace' === currentSettings['Utils.AncestorPiAppFilter.projectScope']
                }, {
                    boxLabel: 'User selectable (either current project(s) or all projects in workspace).',
                    name: 'Utils.AncestorPiAppFilter.projectScope',
                    inputValue: 'user',
                    checked: 'user' === currentSettings['Utils.AncestorPiAppFilter.projectScope']
                }, ],
                listeners: {
                    scope: this,
                    change: function(group, newValue) {
                        return;
                    }
                }
            }
        ];
        pluginSettingsFields = _.map(pluginSettingsFields, function(pluginSettingsField) {
            return _.merge(pluginSettingsField, this.settingsConfig)
        }, this);
        // apply any settings config to each field added by the plugin
        return pluginSettingsFields.concat(fields || []);
    },

    // Requires that app settings are available (e.g. from 'beforelaunch')
    _addControlCmp: function() {
        var deferred = Ext.create('Deft.Deferred');
        var controlsLayout = {
            type: 'hbox',
            align: 'middle',
            defaultMargins: '0 10 0 0'
        };
        var ownerLabelWidth = this.ownerLabelWidth;
        if (this.cmp.getWidth() < this.singleRowMinWidth) {
            controlsLayout = 'vbox';
            ownerLabelWidth = this.ancestorLabelWidth;
        }
        var scopeControlByItself = false;
        if (this._showAncestorFilter() == false && this._showIgnoreProjectScopeControl() == true) {
            scopeControlByItself = true;
        }
        var controls = {
            xtype: 'container',
            id: 'controlsArea',
            overflowX: 'auto',
            layout: {
                type: 'hbox',
                align: 'top'
            },
            items: [{
                xtype: 'container',
                id: 'pubSubIndicatorArea',
                width: 25,
                padding: '6 5 0 0',
                hidden: !this.publisher && !this._isSubscriber(),
                items: [{
                        xtype: 'component',
                        id: 'publisherIndicator',
                        html: '<span class="icon-bullhorn icon-large"></span>',
                        hidden: !this.publisher
                    },
                    {
                        xtype: 'component',
                        id: 'subscriberIndicator',
                        html: '<span class="icon-link icon-large"></span>',
                        hidden: !this._isSubscriber()
                    },
                ]
            }, {
                xtype: 'container',
                id: 'filtersArea',
                layout: controlsLayout,
                items: [{
                    xtype: 'container',
                    id: 'ancestorFilterArea',
                    layout: {
                        type: 'hbox',
                        align: 'middle'
                    },
                    items: [{
                            xtype: 'container',
                            id: 'piTypeArea',
                            layout: {
                                type: 'hbox',
                                align: 'middle'
                            },
                        },
                        {
                            xtype: 'container',
                            id: 'piSelectorArea',
                            layout: {
                                type: 'hbox',
                                align: 'middle',
                                padding: '0 0 0 5'
                            },
                        }
                    ]
                }, {
                    xtype: 'container',
                    id: 'scopeControlArea',
                    width: 250,
                    layout: {
                        type: 'hbox',
                        align: 'middle'
                    },
                    items: [{
                        xtype: 'rallycombobox',
                        id: 'ignoreScopeControl',
                        stateful: true,
                        stateId: this.cmp.getContext().getScopedStateId('Utils.AncestorPiAppFilter.ignoreProjectScopeControl'),
                        stateEvents: ['select'],
                        hidden: this._isSubscriber() || !this._showIgnoreProjectScopeControl(),
                        displayField: 'text',
                        valueField: 'value',
                        labelStyle: this.labelStyle,
                        labelWidth: ownerLabelWidth,
                        fieldLabel: scopeControlByItself ? this.ownerOnlyLabel : this.ownerLabel,
                        // Don't set initial value with this component or it will override the state
                        storeConfig: {
                            fields: ['text', 'value'],
                            data: [{
                                text: "Current Project(s)",
                                value: false
                            }, {
                                text: "Any Project",
                                value: true
                            }]
                        },
                        listeners: {
                            scope: this,
                            change: function(cmp, newValue) {
                                this._onSelect();
                            },
                        },
                    }]
                }]
            }]
        }

        if (this.renderArea) {
            // Without this, the components are clipped on narrow windows
            this.renderArea.setOverflowXY('auto', 'auto');
            this.renderArea.add(controls);
        }

        this._addTooltips();

        // Need to get pi types sorted by ordinal lowest to highest for the filter logic to work
        Rally.data.util.PortfolioItemHelper.getPortfolioItemTypes().then({
            scope: this,
            success: function(data) {
                this.portfolioItemTypes = data;

                if (!this._isSubscriber() && this._showAncestorFilter()) {
                    // Now create the pi type selector
                    this.piTypeSelector = Ext.create('Rally.ui.combobox.PortfolioItemTypeComboBox', {
                        xtype: 'rallyportfolioitemtypecombobox',
                        id: 'Utils.AncestorPiAppFilter.piType',
                        name: 'Utils.AncestorPiAppFilter.piType',
                        width: 250,
                        // Disable the preference enabled combo box plugin so that this control value is app specific
                        plugins: [],
                        stateful: true,
                        stateId: this.cmp.getContext().getScopedStateId('Utils.AncestorPiAppFilter.piType'),
                        stateEvents: ['select'],
                        fieldLabel: this.ancestorLabel,
                        labelWidth: this.ancestorLabelWidth,
                        labelStyle: this.labelStyle,
                        valueField: 'TypePath',
                        value: this._defaultPortfolioItemType(),
                        allowNoEntry: false,
                        defaultSelectionPosition: 'first',
                        listeners: {
                            scope: this,
                            ready: function(combobox) {
                                // Unfortunately we cannot use the combobox store of PI types for our filter
                                // logic because it is sorted by ordinal from highest to lowest so that the
                                // picker options have a an order familiar to the user.

                                // Don't add the change listener until ready. This prevents us
                                // from adding and removing the pi selector multiple times during
                                // startup which causes a null ptr exception in that component
                                combobox.addListener({
                                    scope: this,
                                    change: this._onPiTypeChange
                                });
                                this._addPiSelector(combobox.getValue()).then({
                                    scope: this,
                                    success: function() {
                                        deferred.resolve();
                                    }
                                })
                            }
                        }
                    });
                    this.renderArea.down('#piTypeArea').add(this.piTypeSelector);
                }
                else {
                    deferred.resolve();
                }
            }
        });
        return deferred.promise;
    },

    _addTooltips: function() {
        Ext.tip.QuickTipManager.register({
            target: 'publisherIndicator',
            //title: 'Publisher Indicator',
            text: 'This app broadcasts filter settings to any enabled ancestor filtered apps (indicated with <span class="icon-link icon-large"></span>)',
            showDelay: 50,
            border: true
        });

        Ext.tip.QuickTipManager.register({
            target: 'subscriberIndicator',
            //title: 'Subscriber Indicator',
            text: 'This app listens for filter settings from any enabled ancestor filter broadcast app (indicated with <span class="icon-bullhorn icon-large"></span>)',
            showDelay: 50,
            border: true
        });
    },

    _onCmpResize: function(cmp, width) {
        var controlsLayout = {
            type: 'hbox',
            align: 'middle',
            defaultMargins: '0 10 0 0'
        };
        if (width < this.singleRowMinWidth) {
            controlsLayout = {
                type: 'vbox'
            }
        }
        var filtersArea = this.renderArea.down('#filtersArea');
        if (filtersArea) {
            var controlsArea = this.renderArea.down('#controlsArea');
            var filters = filtersArea.removeAll(false);
            var newFiltersArea = {
                xtype: 'container',
                id: 'filtersArea',
                layout: controlsLayout,
                items: filters,
                hidden: filtersArea.isHidden()
            }
            controlsArea.remove(filtersArea, false);
            controlsArea.add(newFiltersArea);
        }
    },

    _hideControlCmp: function() {
        if (this.renderArea) {
            this.renderArea.down('#pubSubIndicatorArea').show();
            this.renderArea.down('#subscriberIndicator').show();
            this.renderArea.down('#filtersArea').hide();
        }
    },

    _onPiTypeChange: function(piTypeSelector, newValue, oldValue) {
        if (newValue) {
            this._removePiSelector();
            this._addPiSelector(newValue).then({
                scope: this,
                success: function() {
                    this._setReady()
                }
            });
        }
    },

    _removePiSelector: function() {
        this.renderArea.down('#piSelectorArea').removeAll();
    },

    _addPiSelector: function(piType) {
        var deferred = Ext.create('Deft.Deferred');
        this.piSelector = Ext.create('Rally.ui.combobox.ArtifactSearchComboBox', {
            id: 'Utils.AncestorPiAppFilter.piSelector',
            width: 250,
            labelAlign: 'top',
            storeConfig: {
                models: piType,
                autoLoad: true,
                context: {
                    project: null
                }
            },
            stateful: true,
            stateId: this.cmp.getContext().getScopedStateId('Utils.AncestorPiAppFilter.piSelector'),
            stateEvents: ['select'],
            valueField: '_ref',
            allowClear: true,
            clearValue: null,
            allowNoEntry: this.allowNoEntry,
            noEntryValue: '',
            defaultSelectionPosition: null,
            listeners: {
                scope: this,
                select: function(cmp, records) {
                    this._onSelect();
                },
                ready: function(cmp, records) {
                    deferred.resolve();
                }
            }
        });
        // Allow this combobox to save null state (which is default behavior of
        // stateful mixin, but for some reason was overridden in combobox)
        Ext.override(this.piSelector, {
            saveState: function() {
                var me = this,
                    id = me.stateful && me.getStateId(),
                    hasListeners = me.hasListeners,
                    state;

                if (id) {
                    state = me.getState() || {}; //pass along for custom interactions
                    if (!hasListeners.beforestatesave || me.fireEvent('beforestatesave', me, state) !== false) {
                        Ext.state.Manager.set(id, state);
                        if (hasListeners.statesave) {
                            me.fireEvent('statesave', me, state);
                        }
                    }
                }
            }
        });
        this.renderArea.down('#piSelectorArea').add(this.piSelector);
        return deferred.promise;
    },

    _showAncestorFilter: function() {
        return this.cmp.getSetting('Utils.AncestorPiAppFilter.enableAncestorPiFilter2');
    },

    _showIgnoreProjectScopeControl: function() {
        return this.cmp.getSetting('Utils.AncestorPiAppFilter.projectScope') == 'user';
    },

    _ignoreProjectScope: function() {
        var result = false;
        if (this._showIgnoreProjectScopeControl()) {
            // If the control is shown, that values overrides the ignoreScope app setting
            result = this.renderArea.down('#ignoreScopeControl').getValue();
        }
        else if (this.cmp.getSetting('Utils.AncestorPiAppFilter.projectScope') == 'workspace') {
            result = true;
        }
        return result;
    },

    _isSubscriber: function() {
        return this.isSubscriber;
    },

    _defaultPortfolioItemType: function() {
        return this.cmp.getSetting('Utils.AncestorPiAppFilter.defaultPiType');
    },

    _propertyPrefix: function(typeName, piTypesAbove) {
        var property;
        if (typeName === 'hierarchicalrequirement' || typeName === 'userstory') {
            property = piTypesAbove[0].get('Name');
        }
        else if (typeName === 'defect') {
            property = 'Requirement.' + piTypesAbove[0].get('Name');
        }
        else if (Ext.String.startsWith(typeName, 'portfolioitem')) {
            property = 'Parent';
        }

        if (property) {
            // property already gets us to the lowest pi level above the current type
            // for each additional level, add a 'Parent' term, except for the last
            // type in the list which is the currently selected pi type ancestor
            _.forEach(piTypesAbove.slice(1), function(piType) {
                property = property + '.Parent';
            }, this);
        }

        return property;
    },

    /**
     * Return a list of portfolio item types AT or below the selected pi type,
     * that are an ancestor of the given model, or null if there are no pi type
     * ancestors for the given model.
     */
    _piTypeAncestors: function(modelName, selectedPiTypePath) {
        var result = null;
        var selectedPiTypeIndex;
        var modelNamePiTypeIndex;

        if (_.contains(['hierarchicalrequirement', 'userstory', 'defect'], modelName)) {
            selectedPiTypeIndex = _.findIndex(this.portfolioItemTypes, function(piType) {
                return piType.get('TypePath').toLowerCase() === selectedPiTypePath.toLowerCase();
            });
            result = this.portfolioItemTypes.slice(0, selectedPiTypeIndex + 1);
        }
        else if (Ext.String.startsWith(modelName, 'portfolioitem')) {
            modelNamePiTypeIndex = _.findIndex(this.portfolioItemTypes, function(piType) {
                return piType.get('TypePath').toLowerCase() === modelName.toLowerCase();
            });
            selectedPiTypeIndex = _.findIndex(this.portfolioItemTypes, function(piType) {
                return piType.get('TypePath').toLowerCase() === selectedPiTypePath.toLowerCase();
            });

            if (modelNamePiTypeIndex < selectedPiTypeIndex) {
                // Don't include the current model pi in the list of ancestors
                // Include the selcted pi type ancestor
                result = this.portfolioItemTypes.slice(modelNamePiTypeIndex + 1, selectedPiTypeIndex + 1);
            }
        }

        return result;
    }
});
