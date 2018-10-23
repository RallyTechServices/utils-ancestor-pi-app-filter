Ext.define('Utils.AncestorPiAppFilter', {
    alias: 'plugin.UtilsAncestorPiAppFilter',
    mixins: ['Ext.AbstractPlugin'],
    extend: 'Ext.Component',

    statics: {
        RENDER_AREA_ID: 'utils-ancestor-pi-app-filter'
    },

    config: {
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
        label: 'With Ancestor',

        /**
         * @cfg {Number}
         * Width of the Portfolio Item Type picker label
         */
        labelWidth: 125,

        /**
         * @cfg {Number}
         * Style of the Portfolio Item Type picker label
         */
        labelStyle: 'font-size: large',
    },

    portfolioItemTypes: [],
    readyDeferred: null,
    piTypesDeferred: null,

    constructor: function(config) {
        this.callParent(arguments);
    },

    init: function(cmp) {
        this.cmp = cmp;
        this.renderArea = this.cmp.down('#' + Utils.AncestorPiAppFilter.RENDER_AREA_ID);
        var cmpGetSettingsFields = this.cmp.getSettingsFields;
        this.cmp.getSettingsFields = function() {
            return this._getSettingsFields(cmpGetSettingsFields.apply(cmp, arguments));
        }.bind(this);
        var appDefaults = this.cmp.defaultSettings;
        appDefaults['Utils.AncestorPiAppFilter.enableAncestorPiFilter'] = false;
        this.cmp.setDefaultSettings(appDefaults);

        if (this._isAncestorFilterEnabled() && this.renderArea) {
            // Need to get pi types sorted by ordinal lowest to highest for the filter logic to work
            this.piTypesPromise = Rally.data.util.PortfolioItemHelper.getPortfolioItemTypes().then({
                scope: this,
                success: function(data) {
                    this.portfolioItemTypes = data;
                    this._addControlCmp();
                }
            });
        }
        else {
            this.fireEvent('ready', this);
        }
    },

    initComponent: function() {
        this.callParent(arguments);
        this.addEvents('ready', 'select');
    },

    // Return a proimse that resolves to a filter (or null) after both:
    // - the component has finished restoring its state and has an initial value.
    // - portfolio item types have been loaded
    getFilterForType: function(type) {
        var filter;

        if (this._isAncestorFilterEnabled()) {
            var modelName = type.toLowerCase();
            var selectedPiType = this.piTypeSelector.getRecord();
            if (selectedPiType) {
                var selectedPiTypePath = selectedPiType.get('TypePath');
                var selectedRecord = this.piSelector.getRecord();
                var selectedPi = this.piSelector.getValue()
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
        }

        return filter;
    },

    _getSettingsFields: function(fields) {
        return [_.merge({
            xtype: 'rallycheckboxfield',
            id: 'Utils.AncestorPiAppFilter.enableAncestorPiFilter',
            name: 'Utils.AncestorPiAppFilter.enableAncestorPiFilter',
            fieldLabel: 'Enable Filtering by Ancestor Portfolio Items',
        }, this.settingsConfig)].concat(fields || []);
    },

    // Requires that app settings are available (e.g. from 'beforelaunch')
    _addControlCmp: function() {
        this.piTypeSelector = Ext.create('Rally.ui.combobox.PortfolioItemTypeComboBox', {
            xtype: 'rallyportfolioitemtypecombobox',
            id: 'Utils.AncestorPiAppFilter.piType',
            name: 'Utils.AncestorPiAppFilter.piType',
            fieldLabel: this.label,
            labelWidth: this.labelWidth,
            labelStyle: this.labelStyle,
            valueField: 'TypePath',
            allowNoEntry: false,
            defaultSelectionPosition: 'last',
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
                    this._addPiSelector(combobox.getValue());
                }
            }
        });
        this.renderArea.add(this.piTypeSelector);
    },

    _onPiTypeChange: function(piTypeSelector, newValue, oldValue) {
        if (newValue) {
            this._removePiSelector();
            this._addPiSelector(newValue);
        }
    },

    _removePiSelector: function() {
        if (this.piSelector) {
            this.renderArea.remove(this.piSelector);
        }
    },

    _addPiSelector: function(piType) {
        this.piSelector = Ext.create('Rally.ui.combobox.ArtifactSearchComboBox', {
            id: 'Utils.AncestorPiAppFilter.piSelector',
            labelAlign: 'top',
            storeConfig: {
                models: piType,
                autoLoad: true
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
                    this.fireEvent('select', this, records);
                },
                ready: function(cmp, records) {
                    this.fireEvent('ready', this, records);
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
        })
        this.renderArea.add(this.piSelector);
    },

    _isAncestorFilterEnabled: function() {
        return this.cmp.getSetting('Utils.AncestorPiAppFilter.enableAncestorPiFilter');
    },

    _propertyPrefix: function(typeName, piTypesAbove) {
        var property;
        if (typeName === 'hierarchicalrequirement' || typeName === 'userstory') {
            property = piTypesAbove[0].get('Name');
        }
        else if (typeName === 'defect') {
            property = 'Requirement.' + piTypesAbove[0].get('Name');
        }
        else if (typeName.startsWith('portfolioitem')) {
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
        else if (modelName.startsWith('portfolioitem')) {
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
