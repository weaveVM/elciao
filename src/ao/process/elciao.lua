local ao = require("ao")
local json = require("json")

if not RpcEndpoint then
    RpcEndpoint = ""
end

if not Network then
    Network = ""
end

if not ChainId then
    ChainId = ""
end

if not Name then
    Name = ""
end

if not Admin then
    Admin = ""
end

if not LatestBlock then
    LatestBlock = ""
end

if not LatestSlot then
    LatestSlot = ""
end

if not Blocks then
    Blocks = {}
end

if not NodeCreated then
    NodeCreated = false
end

--[[
     Info
   ]]
--

Handlers.add(
    "info",
    Handlers.utils.hasMatchingTag("Action", "Info"),
    function(msg)
        ao.send(
            {
                Target = msg.From,
                RpcEndpoint = RpcEndpoint,
                Network = Network,
                ChainId = ChainId,
                Name = Name,
                Admin = Admin,
                LatestBlock = LatestBlock,
                LatestSlot = LatestSlot,
                NodeCreated = NodeCreated
            }
        )
    end
)

Handlers.add(
    "getBlocks",
    Handlers.utils.hasMatchingTag("Action", "GetBlocks"),
    function(msg)
        ao.send(
            {
                Target = msg.From,
                Data = json.encode(Blocks)
            }
        )
    end
)

Handlers.add(
    "getBlockById",
    Handlers.utils.hasMatchingTag("Action", "GetBlockById"),
    function(msg)
        assert(type(msg.BlockNumber) == "string", "")
        ao.send(
            {
                Target = msg.From,
                Data = json.encode(Blocks[msg.BlockNumber])
            }
        )
    end
)

Handlers.add(
    "updateMetadata",
    Handlers.utils.hasMatchingTag("Action", "UpdateMetadata"),
    function(msg)
        assert(msg.Admin == Admin, "")
        assert(type(msg.RpcEndpoint) == "string", "err_invalid_argument_type")
        assert(type(msg.Network) == "string", "err_invalid_argument_type")
        assert(type(msg.ChainId) == "string", "err_invalid_argument_type")
        assert(type(msg.Name) == "string", "err_invalid_argument_type")

        RpcEndpoint = msg.RpcEndpoint
        Network = msg.Network
        ChainId = msg.ChainId
        Name = msg.Name

        ao.send(
            {
                Action = "Elciao-Node-Update"
            }
        )
    end
)

Handlers.add(
    "setUpNode",
    Handlers.utils.hasMatchingTag("Action", "SetUpNode"),
    function(msg)
        assert(NodeCreated == false, "err_node_already_created")
        assert(type(msg.Slot) == "string", "err_invalid_argument_type")
        assert(type(msg.BlockNumber) == "string", "err_invalid_argument_type")
        assert(type(msg.Data) == "string", "err_missing_block_data")
        assert(type(msg.Admin) == "string", "err_invalid_argument_type")
        assert(type(msg.RpcEndpoint) == "string", "err_invalid_argument_type")
        assert(type(msg.Network) == "string", "err_invalid_argument_type")
        assert(type(msg.ChainId) == "string", "err_invalid_argument_type")
        assert(type(msg.Name) == "string", "err_invalid_argument_type")
        assert(type(msg.Admin) == "string", "err_invalid_argument_type")

        NodeCreated = true

        RpcEndpoint = msg.RpcEndpoint
        Network = msg.Network
        ChainId = msg.ChainId
        Name = msg.Name
        Admin = msg.Admin
        LatestBlock = msg.BlockNumber
        LatestSlot = msg.Slot

        Blocks[msg.BlockNumber] = msg.Data

        ao.send(
            {
                Action = "Elciao-Node-Setup",
                BlockNumber = msg.BlockNumber,
                Slot = msg.Slot
            }
        )
    end
)

Handlers.add(
    "indexBlock",
    Handlers.utils.hasMatchingTag("Action", "IndexBlock"),
    function(msg)
        assert(type(msg.Data) == "string", "err_missing_block_data")
        assert(msg.From == Admin, "err_only_admin")
        assert(tonumber(msg.BlockNumber) > tonumber(LatestBlock), "err_invalid_blocks_order")
        assert(tonumber(msg.Slot) > tonumber(LatestSlot), "err_invalid_slot_order")
        Blocks[msg.BlockNumber] = msg.Data
        LatestBlock = msg.BlockNumber
        LatestSlot = msg.Slot

        ao.send(
            {
                Action = "Elciao-Block-Indexing",
                BlockNumber = msg.BlockNumber,
                Slot = msg.Slot
            }
        )
    end
)
